import { asapScheduler, combineLatest, EMPTY, merge, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    exhaustMap,
    filter,
    observeOn,
    ignoreElements,
    map,
    mergeMap,
    share,
    shareReplay,
    startWith,
    takeUntil,
    withLatestFrom,
} from 'rxjs/operators';
import type { Shown } from '../shared/shown.ts';
import {
    aspectSize,
    exportPixels,
    followed,
    frameAtX,
    frameCount,
    isZoom,
    markerX,
    sameLayout,
    stripGeometry,
    tilesIn,
    withExportChange,
    zoomedStrip,
    type ZoomGesture,
} from '../components/sketch/animation.ts';
import { filmstrip$ } from '../engine/thumbnails.ts';
import { statusOf } from '../components/sketch/export/export.ts';
import type {
    ExportStatus,
    SavedFile,
} from '../components/sketch/export/export-panel.component.ts';
import { imageExport$, imageStill$ } from '../engine/export.ts';
import { chainShowing$, viewRatio$ } from '../engine/moment.ts';
import { view$, type View } from '../engine/view.ts';
import { imageInput, playbackInput } from '../inputs.ts';
import type { AppInput, Program } from '../program.ts';
import { asOutput } from '../settings.ts';

export const shownOf =
    (empty: string) =>
    (view: View): Shown =>
        view.kind === 'frame'
            ? view
            : { kind: 'message', text: view.kind === 'empty' ? empty : view.message };

// Large enough that rounding keeps the ratio: at 1 every aspect rounds to a square.
const ASPECT_SIDE = 2160;

export const outputProgram = {
    id: 'output',
    inputs: { playback: playbackInput, in: imageInput('in') },
    title: 'output',
    category: 'make',
    icon: 'M3 5h18v12H3zM8 21h8M12 17v4',
    size: { width: 480, height: 620 },
    minimum: { width: 260, height: 460 },
    launch: async () => {
        const [{ HksImageView }, { HksFrameStrip }, { HksExportPanel }] = await Promise.all([
            import('../components/image-view/image-view.component.ts'),
            import('../components/sketch/strip/frame-strip.component.ts'),
            import('../components/sketch/export/export-panel.component.ts'),
        ]);
        const view = new HksImageView();
        const strip = new HksFrameStrip();
        const exporter = new HksExportPanel();
        strip.slot = 'controls';
        exporter.slot = 'controls';
        view.append(strip, exporter);

        return {
            element: view,
            run$: (
                {
                    followedImage$,
                    clock$,
                    zoom$,
                    duration$,
                    playhead$,
                    playing$,
                    aspect$,
                    previewSide$,
                },
                self,
            ) => {
                const settings$ = self.settings$.pipe(map(asOutput), distinctUntilChanged());
                const exportSettings$ = settings$.pipe(
                    map(settings => settings.export),
                    distinctUntilChanged(),
                );
                const image$ = followedImage$('in').pipe(
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const frames$ = combineLatest([duration$, exportSettings$]).pipe(
                    map(([seconds, { fps }]) => frameCount(seconds, fps)),
                    distinctUntilChanged(),
                );
                const shape$ = aspect$.pipe(
                    map(aspect => aspectSize(aspect, ASPECT_SIDE)),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const ratio$ = viewRatio$(zoom$).pipe(
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const geometry$ = combineLatest([
                    frames$,
                    settings$.pipe(
                        map(({ stripLevel }) => stripLevel),
                        distinctUntilChanged(),
                    ),
                    shape$,
                ]).pipe(
                    map(([frames, level, shape]) => stripGeometry(frames, level, shape)),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const visible$ = strip.visible$.pipe(
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const layout$ = combineLatest([visible$, geometry$]).pipe(
                    map(([visible, geometry]) => ({ geometry, range: tilesIn(visible, geometry) })),
                    distinctUntilChanged(sameLayout),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );
                const stripZooms$ = merge(
                    strip.zooms$.pipe(
                        filter(isZoom),
                        map((zoom): ZoomGesture => ({ kind: 'step', zoom })),
                    ),
                    strip.pinches$.pipe(
                        map(({ factor, x }): ZoomGesture => ({ kind: 'pinch', factor, x })),
                    ),
                ).pipe(
                    withLatestFrom(geometry$, visible$),
                    map(([gesture, geometry, visible]) => zoomedStrip(gesture, geometry, visible)),
                    share(),
                );
                const follow$ = playhead$.pipe(
                    withLatestFrom(geometry$, visible$, playing$),
                    mergeMap(([t, geometry, visible, playing]) => {
                        const left = playing ? followed(markerX(t, geometry), visible) : null;

                        return left === null ? EMPTY : of(left);
                    }),
                );

                const request$ = combineLatest([image$, duration$, shape$, exportSettings$]).pipe(
                    map(([image, seconds, size, settings]) => ({
                        image,
                        seconds,
                        size,
                        settings,
                        framed: false,
                    })),
                );

                const exported$ = merge(
                    exporter.starts$.pipe(
                        withLatestFrom(request$),
                        exhaustMap(([, request]) =>
                            imageExport$(request).pipe(takeUntil(exporter.cancels$)),
                        ),
                    ),
                    exporter.stills$.pipe(
                        withLatestFrom(request$, playhead$),
                        exhaustMap(([, request, t]) => imageStill$(request, t)),
                    ),
                ).pipe(share());

                const status$ = merge(
                    exported$.pipe(map(statusOf)),
                    exporter.cancels$.pipe(map((): ExportStatus => ({ kind: 'idle' }))),
                ).pipe(startWith({ kind: 'idle' as const }));

                const files$: Observable<SavedFile> = exported$.pipe(
                    mergeMap(event =>
                        event.kind === 'file'
                            ? of({ blob: event.blob, name: `hakase-output.${event.extension}` })
                            : EMPTY,
                    ),
                );

                const summary$ = combineLatest([shape$, exportSettings$, frames$]).pipe(
                    map(([size, settings, frames]) => {
                        const { width, height } = exportPixels(size, settings.size);

                        return `${width} × ${height} · ${frames} frames`;
                    }),
                );

                return merge(
                    view
                        .connect$(
                            view$(
                                image$,
                                chainShowing$(clock$, aspect$, previewSide$, view.sizes$, ratio$),
                            ).pipe(
                                map(
                                    shownOf(
                                        'Nothing plugged in. In state mode, wire a sketch into in.',
                                    ),
                                ),
                            ),
                        )
                        .pipe(ignoreElements()),
                    strip
                        .connect$(
                            layout$,
                            playhead$,
                            filmstrip$(
                                image$,
                                shape$.pipe(map(shape => ({ frame: null, shape }))),
                                duration$,
                                ratio$,
                                layout$,
                            ),
                            merge(
                                follow$,
                                stripZooms$.pipe(
                                    map(({ left }) => left),
                                    observeOn(asapScheduler),
                                ),
                            ),
                        )
                        .pipe(ignoreElements()),
                    exporter
                        .connect$(exportSettings$, summary$, status$, files$, aspect$)
                        .pipe(ignoreElements()),
                    strip.seeks$.pipe(
                        withLatestFrom(geometry$),
                        map(([{ phase, x }, geometry]): AppInput => ({
                            kind: 'scrub',
                            phase,
                            at: frameAtX(x, geometry) / geometry.frames,
                        })),
                    ),
                    stripZooms$.pipe(
                        withLatestFrom(settings$),
                        map(([{ level }, settings]): AppInput => ({
                            kind: 'settings',
                            settings: { ...settings, stripLevel: level },
                        })),
                    ),
                    exporter.aspects$.pipe(map((aspect): AppInput => ({ kind: 'aspect', aspect }))),
                    exporter.changes$.pipe(
                        withLatestFrom(settings$),
                        map(([change, settings]): AppInput => ({
                            kind: 'settings',
                            settings: {
                                ...settings,
                                export: withExportChange(settings.export, change),
                            },
                        })),
                    ),
                );
            },
        };
    },
} satisfies Program;
