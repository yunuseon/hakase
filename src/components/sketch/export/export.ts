import { from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import type { Size } from '../../window/frame.ts';
import { bitrateOf, type ExportSettings } from '../animation.ts';
import { muxWebM, type VideoChunk } from './webm.ts';
import type { ExportStatus } from './export-panel.component.ts';
import { zip, zipEntry, type ZipEntry } from './zip.ts';

export type ExportEvent =
    | { readonly kind: 'progress'; readonly done: number }
    | { readonly kind: 'file'; readonly blob: Blob; readonly extension: string }
    | { readonly kind: 'failed'; readonly message: string };

export type Writer = {
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

export const writer$ = (pixels: Size, settings: ExportSettings): Observable<Writer> =>
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

export const statusOf = (event: ExportEvent): ExportStatus => {
    switch (event.kind) {
        case 'progress':
            return { kind: 'running', done: event.done };
        case 'file':
            return { kind: 'idle' };
        case 'failed':
            return { kind: 'failed', message: event.message };
    }
};

export const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : 'The export failed.';
