import { concat, defer, from, Observable, of } from 'rxjs';
import { catchError, concatMap, map, switchMap, takeWhile } from 'rxjs/operators';
import type { Size } from '../../window/frame.ts';
import {
    bitrateOf,
    exportFrames,
    exportPixels,
    frameCount,
    type ExportSettings,
} from '../animation.ts';
import { centre, type SketchParams } from '../params.ts';
import type { Orbit } from '../space.ts';
import { createSketch, drawFrame } from '../gl/sketch-program.ts';
import { offscreen$, prepareStill } from '../gl/still.ts';
import { muxWebM, type VideoChunk } from './webm.ts';
import { zip, zipEntry, type ZipEntry } from './zip.ts';

export type ExportRequest = {
    readonly source: string;
    readonly params: SketchParams;
    readonly orbit: Orbit;
    readonly seconds: number;
    readonly settings: ExportSettings;
};

export type ExportEvent =
    | { readonly kind: 'progress'; readonly done: number }
    | { readonly kind: 'file'; readonly blob: Blob; readonly extension: string }
    | { readonly kind: 'failed'; readonly message: string };

type Writer = {
    readonly add: (canvas: OffscreenCanvas, index: number) => Promise<void>;
    readonly finish: () => Promise<Blob>;
    readonly close: () => void;
    readonly extension: string;
};

const CODECS = [
    { config: 'vp09.00.51.08', container: 'V_VP9' },
    { config: 'vp8', container: 'V_VP8' },
] as const;

// Waits while the encoder is behind, so a long export does not queue every frame in memory at once.
const drained = (encoder: VideoEncoder): Promise<void> =>
    encoder.encodeQueueSize <= 2
        ? Promise.resolve()
        : new Promise<void>(resolve => {
              encoder.addEventListener(
                  'dequeue',
                  () => {
                      resolve();
                  },
                  { once: true },
              );
          }).then(() => drained(encoder));

const videoWriter = async (pixels: Size, { fps, quality }: ExportSettings): Promise<Writer> => {
    if (typeof VideoEncoder === 'undefined') {
        throw new Error('This browser cannot encode video. Try the PNG export.');
    }

    const base = {
        width: pixels.width,
        height: pixels.height,
        bitrate: bitrateOf(pixels, fps, quality),
        framerate: fps,
    };
    const supported = await Promise.all(
        CODECS.map(codec =>
            VideoEncoder.isConfigSupported({ ...base, codec: codec.config }).then(
                ({ supported: yes }) => yes === true,
            ),
        ),
    );
    const codec = CODECS.find((_, index) => supported[index]);

    if (codec === undefined) {
        throw new Error('This browser cannot encode VP9 or VP8 at this size. Try a smaller one.');
    }

    const chunks: VideoChunk[] = [];
    const encoder = new VideoEncoder({
        output: chunk => {
            const data = new Uint8Array(chunk.byteLength);
            chunk.copyTo(data);
            chunks.push({ data, timestamp: chunk.timestamp, key: chunk.type === 'key' });
        },
        error: () => undefined,
    });
    encoder.configure({ ...base, codec: codec.config });

    return {
        extension: 'webm',
        add: (canvas, index) => {
            const frame = new VideoFrame(canvas, {
                timestamp: Math.round((index * 1e6) / fps),
                duration: Math.round(1e6 / fps),
            });
            // A key frame every two seconds: each starts a cluster a player can seek to.
            encoder.encode(frame, { keyFrame: index % (2 * fps) === 0 });
            frame.close();

            return drained(encoder);
        },
        finish: async () => {
            await encoder.flush();
            encoder.close();

            return new Blob([muxWebM({ codec: codec.container, ...pixels, fps, chunks })], {
                type: 'video/webm',
            });
        },
        close: () => {
            if (encoder.state !== 'closed') {
                encoder.close();
            }
        },
    };
};

const imageWriter = (): Writer => {
    const entries: ZipEntry[] = [];

    return {
        extension: 'zip',
        add: async (canvas, index) => {
            const png = await canvas.convertToBlob({ type: 'image/png' });
            entries.push(
                zipEntry(
                    `frame-${String(index + 1).padStart(5, '0')}.png`,
                    new Uint8Array(await png.arrayBuffer()),
                ),
            );
        },
        finish: () => Promise.resolve(new Blob([...zip(entries)], { type: 'application/zip' })),
        close: () => undefined,
    };
};

const writer$ = (pixels: Size, settings: ExportSettings): Observable<Writer> =>
    from(
        settings.format === 'webm' ? videoWriter(pixels, settings) : Promise.resolve(imageWriter()),
    ).pipe(
        switchMap(
            writer =>
                new Observable<Writer>(subscriber => {
                    subscriber.next(writer);

                    return () => {
                        writer.close();
                    };
                }),
        ),
    );

const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : 'The export failed.';

export const export$ = ({
    source,
    params,
    orbit,
    seconds,
    settings,
}: ExportRequest): Observable<ExportEvent> => {
    const pixels = exportPixels(params, settings.size);
    const frames = exportFrames(frameCount(seconds, settings.fps), params.trails > 0);

    return offscreen$(pixels).pipe(
        switchMap((surface): Observable<ExportEvent> => {
            const compiled = createSketch(surface.gl, source);

            if (!compiled.ok) {
                return of({ kind: 'failed' as const, message: compiled.message });
            }

            prepareStill(
                surface,
                compiled.sketch,
                params,
                pixels,
                pixels.width / Math.max(params.width, 1),
            );

            return writer$(pixels, settings).pipe(
                switchMap(writer =>
                    concat(
                        from(frames).pipe(
                            concatMap((frame, step) =>
                                defer(() => {
                                    drawFrame(
                                        surface.gl,
                                        compiled.sketch,
                                        params,
                                        frame.t,
                                        centre,
                                        orbit,
                                    );

                                    // After the draw, never before: the writer reads the canvas as it stands.
                                    return frame.index === null
                                        ? of(undefined)
                                        : from(writer.add(surface.canvas, frame.index));
                                }).pipe(
                                    map((): ExportEvent => ({
                                        kind: 'progress',
                                        done: (step + 1) / frames.length,
                                    })),
                                ),
                            ),
                        ),
                        defer(() => writer.finish()).pipe(
                            map((blob): ExportEvent => ({
                                kind: 'file',
                                blob,
                                extension: writer.extension,
                            })),
                        ),
                    ),
                ),
            );
        }),
        // The surface and writer stay open until unsubscribed, so the file or a failure is where an export ends.
        takeWhile(event => event.kind === 'progress', true),
        catchError((error: unknown) => of({ kind: 'failed' as const, message: messageOf(error) })),
    );
};

// One frame at the export size, standing alone: a still has no previous frame for trails to fade.
export const still$ = (
    { source, params, orbit, settings }: Omit<ExportRequest, 'seconds'>,
    t: number,
): Observable<ExportEvent> => {
    const pixels = exportPixels(params, settings.size);
    const alone = { ...params, trails: 0 };

    return offscreen$(pixels).pipe(
        switchMap((surface): Observable<ExportEvent> => {
            const compiled = createSketch(surface.gl, source);

            if (!compiled.ok) {
                return of({ kind: 'failed' as const, message: compiled.message });
            }

            prepareStill(
                surface,
                compiled.sketch,
                alone,
                pixels,
                pixels.width / Math.max(params.width, 1),
            );
            drawFrame(surface.gl, compiled.sketch, alone, t, centre, orbit);

            return from(surface.canvas.convertToBlob({ type: 'image/png' })).pipe(
                map((blob): ExportEvent => ({ kind: 'file', blob, extension: 'png' })),
            );
        }),
        takeWhile(event => event.kind === 'progress', true),
        catchError((error: unknown) => of({ kind: 'failed' as const, message: messageOf(error) })),
    );
};
