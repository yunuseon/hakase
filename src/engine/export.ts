import { concat, defer, from, Observable, of } from 'rxjs';
import { catchError, concatMap, map, switchMap, takeWhile } from 'rxjs/operators';
import {
    exportFrames,
    exportPixels,
    frameCount,
    type ExportSettings,
} from '../components/sketch/animation.ts';
import { messageOf, writer$, type ExportEvent } from '../components/sketch/export/export.ts';
import { centre } from '../components/sketch/params.ts';
import type { Size } from '../components/window/frame.ts';
import { stagesOf, type Image } from '../image.ts';
import { cook, createEngine, drawn, releaseEngine, type Engine } from './engine.ts';

export type ImageExport = {
    readonly image: Image;
    readonly seconds: number;
    readonly size: Size;
    readonly settings: ExportSettings;
};

const ownEngine$ = new Observable<Engine>(subscriber => {
    const engine = createEngine();
    subscriber.next(engine);

    return () => {
        releaseEngine(engine);
    };
});

export const hasHistory = (image: Image): boolean =>
    stagesOf(image).some(stage =>
        stage.kind === 'pedal'
            ? stage.pedal.kind === 'feedback'
            : stage.panel.trails > 0 || stage.drivers.trails !== null,
    );

const frameAt = (
    engine: Engine,
    { image, seconds }: ImageExport,
    pixels: Size,
    t: number,
    pass: number,
) => {
    const texture = cook(
        engine,
        image,
        { t, seconds, ...pixels, pointer: centre, pass, scale: null },
        performance.now(),
    );
    drawn(engine, texture, pixels.width, pixels.height);
};

export const imageExport$ = (request: ImageExport): Observable<ExportEvent> => {
    const pixels = exportPixels(request.size, request.settings.size);
    const frames = exportFrames(
        frameCount(request.seconds, request.settings.fps),
        hasHistory(request.image),
    );

    return ownEngine$.pipe(
        switchMap(engine =>
            writer$(pixels, request.settings).pipe(
                switchMap(writer =>
                    concat(
                        from(frames).pipe(
                            concatMap((frame, step) =>
                                defer(() => {
                                    frameAt(engine, request, pixels, frame.t, step + 1);

                                    return frame.index === null
                                        ? of(undefined)
                                        : from(writer.add(engine.canvas, frame.index));
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
            ),
        ),
        takeWhile(event => event.kind === 'progress', true),
        catchError((error: unknown) => of({ kind: 'failed' as const, message: messageOf(error) })),
    );
};

export const imageStill$ = (request: ImageExport, t: number): Observable<ExportEvent> => {
    const pixels = exportPixels(request.size, request.settings.size);

    return ownEngine$.pipe(
        switchMap(engine =>
            defer(() => {
                frameAt(engine, request, pixels, t, 1);

                return from(engine.canvas.convertToBlob({ type: 'image/png' }));
            }),
        ),
        map((blob): ExportEvent => ({ kind: 'file', blob, extension: 'png' })),
        takeWhile(event => event.kind === 'progress', true),
        catchError((error: unknown) => of({ kind: 'failed' as const, message: messageOf(error) })),
    );
};
