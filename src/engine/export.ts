import { concat, defer, from, Observable, of } from 'rxjs';
import { catchError, concatMap, map, switchMap, takeWhile } from 'rxjs/operators';
import {
    exportFrames,
    exportPixels,
    frameCount,
    type ExportSettings,
} from '../model/sketch/export.ts';
import { messageOf, pngOf, writer$, type ExportEvent } from '../components/sketch/export/export.ts';
import { centre } from '../model/sketch/params.ts';
import type { Size } from '../layout/frame.ts';
import { hasHistory, samplesWanted, type Image } from '../image.ts';
import { cook, createEngine, presented, readyFor, releaseEngine, type Engine } from './engine.ts';

export type ImageExport = {
    readonly image: Image;
    readonly seconds: number;
    readonly size: Size;
    readonly settings: ExportSettings;
    readonly framed: boolean;
};

const ownEngine$: Observable<Engine> = defer(() => from(createEngine())).pipe(
    switchMap(
        engine =>
            new Observable<Engine>(subscriber => {
                subscriber.next(engine);

                return () => {
                    releaseEngine(engine);
                };
            }),
    ),
);

const readyEngine$ = (image: Image): Observable<Engine> =>
    ownEngine$.pipe(
        switchMap(engine => from(readyFor(engine, image, 'export')).pipe(map(() => engine))),
    );

const frameAt = (
    engine: Engine,
    { image, seconds, size, framed }: ImageExport,
    pixels: Size,
    t: number,
    pass: number,
    // A warm-up frame is drawn for its trail and never shown.
    keep: boolean,
): Promise<ImageBitmap | null> => {
    const picture = cook(
        engine,
        image,
        {
            t,
            seconds,
            ...pixels,
            pointer: centre,
            pass,
            frame: framed ? size : null,
            dotScale: 1,
            lane: 'export',
            samples: samplesWanted(image, 'export'),
            traceSide: null,
        },
        performance.now(),
    );

    return keep
        ? presented(engine, picture, pixels.width, pixels.height, [0, 0, 0])
        : Promise.resolve(null);
};

export const imageExport$ = (request: ImageExport): Observable<ExportEvent> => {
    const pixels = exportPixels(request.size, request.settings.size);
    const frames = exportFrames(
        frameCount(request.seconds, request.settings.fps),
        hasHistory(request.image),
    );

    return readyEngine$(request.image).pipe(
        switchMap(engine =>
            writer$(pixels, request.settings).pipe(
                switchMap(writer =>
                    concat(
                        from(frames).pipe(
                            concatMap((frame, step) =>
                                defer(() =>
                                    from(
                                        frameAt(
                                            engine,
                                            request,
                                            pixels,
                                            frame.t,
                                            step + 1,
                                            frame.index !== null,
                                        ),
                                    ),
                                ).pipe(
                                    concatMap(bitmap =>
                                        bitmap === null || frame.index === null
                                            ? of(undefined)
                                            : from(writer.add(bitmap, frame.index)),
                                    ),
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
            ),
        ),
        takeWhile(event => event.kind === 'progress', true),
        catchError((error: unknown) => of({ kind: 'failed' as const, message: messageOf(error) })),
    );
};

export const imageStill$ = (request: ImageExport, t: number): Observable<ExportEvent> => {
    const pixels = exportPixels(request.size, request.settings.size);

    return readyEngine$(request.image).pipe(
        switchMap(engine =>
            defer(() => from(frameAt(engine, request, pixels, t, 1, true))).pipe(
                concatMap(bitmap => (bitmap === null ? of(new Blob()) : from(pngOf(bitmap)))),
            ),
        ),
        map((blob): ExportEvent => ({ kind: 'file', blob, extension: 'png' })),
        takeWhile(event => event.kind === 'progress', true),
        catchError((error: unknown) => of({ kind: 'failed' as const, message: messageOf(error) })),
    );
};
