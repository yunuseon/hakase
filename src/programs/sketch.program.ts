import { asapScheduler, combineLatest, EMPTY, merge, of, timer, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    exhaustMap,
    filter,
    ignoreElements,
    map,
    mergeMap,
    observeOn,
    share,
    shareReplay,
    startWith,
    switchMap,
    takeUntil,
    withLatestFrom,
} from 'rxjs/operators';
import { HksFpsCounter } from '../components/fps-counter/fps-counter.component.ts';
import { compileFormula$ } from '../components/sketch/compile.ts';
import { knobsUsed } from '../components/sketch/gl/sketch-program.ts';
import { reduceOrbit, type OrbitAction } from '../components/sketch/space.ts';
import { optionsOf } from '../library.ts';
import { themes } from '../components/sketch/themes/registry.ts';
import { HksSketch } from '../components/sketch/sketch.component.ts';
import type { AppInput, Program } from '../program.ts';
import { sameTheme, type Theme } from '../components/sketch/theme.ts';
import { HksSketchControls } from '../components/sketch/controls/sketch-controls.component.ts';
import { HksFrameStrip } from '../components/sketch/strip/frame-strip.component.ts';
import { thumbnails$ } from '../components/sketch/strip/thumbnails.ts';
import {
    HksExportPanel,
    type ExportStatus,
    type SavedFile,
} from '../components/sketch/export/export-panel.component.ts';
import { export$, still$, type ExportEvent } from '../components/sketch/export/export.ts';
import {
    exportPixels,
    followed,
    markerX,
    frameAtX,
    frameCount,
    isZoom,
    sameLayout,
    stripGeometry,
    tilesIn,
    withExportChange,
    zoomedStrip,
    type ZoomGesture,
} from '../components/sketch/animation.ts';
import {
    centre,
    panelParams,
    samePanel,
    steppedRatio,
    type Panel,
    type Pointer,
    type SketchParams,
} from '../components/sketch/params.ts';
import { asSketch, controlsView, withControl, type SketchSettings } from '../settings.ts';
import { devicePixelRatio$ } from '../lib/rx.ts';
import type { Size } from '../components/window/frame.ts';

const SETTLE_MS = 150;

const sameSize = (a: Size, b: Size): boolean => a.width === b.width && a.height === b.height;

const statusOf = (event: ExportEvent): ExportStatus => {
    switch (event.kind) {
        case 'progress':
            return { kind: 'running', done: event.done };
        case 'file':
            return { kind: 'idle' };
        case 'failed':
            return { kind: 'failed', message: event.message };
    }
};

export const sketchProgram: Program = {
    id: 'sketch',
    title: 'sketch',
    icon: 'M3 14 Q 7.5 5.5 12 13 T 21 11',
    size: { width: 640, height: 820 },
    minimum: { width: 320, height: 420 },
    launch: () => {
        const sketch = new HksSketch();

        const fpsCounter = new HksFpsCounter();
        fpsCounter.slot = 'status';

        const controls = new HksSketchControls().presets(
            Object.keys(themes).map(value => ({ value, label: value })),
        );
        controls.slot = 'controls';

        const strip = new HksFrameStrip();
        strip.slot = 'animation';
        const exporter = new HksExportPanel();
        exporter.slot = 'animation';
        controls.append(strip, exporter);

        sketch.append(fpsCounter, controls);

        return {
            element: sketch,
            run$: (state, { settings$: stored$ }) => {
                const { playhead$, source$, zoom$ } = state;
                // Without the comparator, every resize observation would re-prepare the shader even at the same size.
                const size$ = sketch.sizes$.pipe(
                    distinctUntilChanged(sameSize),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                const settings$ = stored$.pipe(
                    map(asSketch),
                    distinctUntilChanged(),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                // samePanel, or every orbit drag would rebuild the theme ramp and re-prepare.
                const panel$ = settings$.pipe(
                    map(({ panel }) => panel),
                    distinctUntilChanged(samePanel),
                );

                const theme$ = settings$.pipe(
                    map(({ theme }) => theme),
                    distinctUntilChanged(),
                    switchMap(name => state.theme$(name)),
                    map(({ value }) => value),
                    distinctUntilChanged(sameTheme),
                );

                const params$ = combineLatest([panel$, size$, theme$]).pipe(
                    map(([panel, size, theme]: [Panel, Size, Theme]): SketchParams => ({
                        ...panelParams(panel),
                        ...size,
                        theme,
                    })),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                const orbit$ = settings$.pipe(
                    map(({ orbit }) => orbit),
                    distinctUntilChanged(),
                );

                // This window's choice; the text behind it is shared with whoever matches.
                const formula$ = settings$.pipe(
                    map(({ formula }) => formula),
                    distinctUntilChanged(),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                const text$ = formula$.pipe(
                    switchMap(name =>
                        source$(name).pipe(
                            map(({ value }) => value),
                            distinctUntilChanged(),
                        ),
                    ),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                // Per process: each canvas has its own GL context to compile into.
                const compiled$ = compileFormula$(sketch.gl, text$).pipe(
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                const shader$ = compiled$.pipe(
                    // A failure simply does not emit, so the canvas keeps the last shader.
                    mergeMap(result => (result.ok ? of(result.sketch) : EMPTY)),
                );

                // A new ratio reallocates the buffer (50ms at the cap), so a moving zoom waits to settle; the first is at once.
                const ratio$ = combineLatest([devicePixelRatio$, zoom$]).pipe(
                    map(([pixelRatio, zoom]) => steppedRatio(pixelRatio, zoom)),
                    distinctUntilChanged(),
                    switchMap((ratio, index) =>
                        index === 0 ? of(ratio) : timer(SETTLE_MS).pipe(map(() => ratio)),
                    ),
                );

                const exportSettings$ = settings$.pipe(
                    map(settings => settings.export),
                    distinctUntilChanged(),
                );

                // One cell of the strip is one exported frame, so the strip follows the export's frame rate.
                const frames$ = combineLatest([state.duration$, exportSettings$]).pipe(
                    map(([seconds, { fps }]) => frameCount(seconds, fps)),
                    distinctUntilChanged(),
                );

                const geometry$ = combineLatest([
                    frames$,
                    settings$.pipe(
                        map(({ stripLevel }) => stripLevel),
                        distinctUntilChanged(),
                    ),
                    size$,
                ]).pipe(
                    map(([frames, level, size]) => stripGeometry(frames, level, size)),
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

                const tab$ = settings$.pipe(
                    map(({ tab }) => tab),
                    distinctUntilChanged(),
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

                // Only while playing: a paused strip belongs to whoever is scrolling it.
                const follow$ = playhead$.pipe(
                    withLatestFrom(geometry$, visible$, state.playing$, tab$),
                    mergeMap(([t, geometry, visible, playing, tab]) => {
                        const left =
                            playing && tab === 'animation'
                                ? followed(markerX(t, geometry), visible)
                                : null;

                        return left === null ? EMPTY : of(left);
                    }),
                );

                // A context of their own only while the tab is open: a closed tab holds no GPU at all.
                const thumbnailed$ = tab$.pipe(
                    switchMap(tab =>
                        tab === 'animation'
                            ? thumbnails$(
                                  text$,
                                  combineLatest([params$, orbit$, devicePixelRatio$]).pipe(
                                      map(([params, orbit, ratio]) => ({ params, orbit, ratio })),
                                  ),
                                  layout$,
                              )
                            : EMPTY,
                    ),
                );

                const request$ = combineLatest([text$, params$, orbit$, exportSettings$]).pipe(
                    map(([source, params, orbit, settings]) => ({
                        source,
                        params,
                        orbit,
                        settings,
                    })),
                );

                // exhaustMap: a second click while exporting is ignored, not a second export.
                const exported$ = merge(
                    exporter.starts$.pipe(
                        withLatestFrom(request$, state.duration$),
                        exhaustMap(([, request, seconds]) =>
                            export$({ ...request, seconds }).pipe(takeUntil(exporter.cancels$)),
                        ),
                    ),
                    exporter.stills$.pipe(
                        withLatestFrom(request$, playhead$),
                        exhaustMap(([, request, t]) => still$(request, t)),
                    ),
                ).pipe(share());

                const status$ = merge(
                    exported$.pipe(map(statusOf)),
                    exporter.cancels$.pipe(map((): ExportStatus => ({ kind: 'idle' }))),
                ).pipe(startWith({ kind: 'idle' as const }));

                const files$: Observable<SavedFile> = exported$.pipe(
                    mergeMap(event => (event.kind === 'file' ? of(event) : EMPTY)),
                    withLatestFrom(formula$),
                    map(([{ blob, extension }, formula]) => ({
                        blob,
                        name: `hakase-${formula}.${extension}`,
                    })),
                );

                const summary$ = combineLatest([size$, exportSettings$, frames$]).pipe(
                    map(([size, settings, frames]) => {
                        const { width, height } = exportPixels(size, settings.size);

                        return `${width} × ${height} · ${frames} frames`;
                    }),
                );

                const changed = (settings: SketchSettings): AppInput => ({
                    kind: 'settings',
                    settings,
                });

                return merge(
                    sketch
                        .connect$(
                            params$,
                            playhead$,
                            shader$,
                            ratio$,
                            combineLatest([
                                sketch.pointers$.pipe(startWith(centre)),
                                sketch.presses$.pipe(startWith(false), distinctUntilChanged()),
                            ]).pipe(map(([{ x, y }, down]): Pointer => ({ x, y, down }))),
                            orbit$,
                        )
                        .pipe(ignoreElements()),
                    fpsCounter.connect$(playhead$).pipe(ignoreElements()),
                    controls
                        .connect$(
                            settings$.pipe(map(controlsView)),
                            shader$.pipe(map(knobsUsed)),
                            state.library$.pipe(map(optionsOf)),
                        )
                        .pipe(ignoreElements()),
                    strip
                        .connect$(
                            layout$,
                            playhead$,
                            thumbnailed$,
                            merge(
                                follow$,
                                stripZooms$.pipe(
                                    map(({ left }) => left),
                                    // After the fold has laid out the new level: before it, the track still has its old width and clamps the scroll.
                                    observeOn(asapScheduler),
                                ),
                            ),
                        )
                        .pipe(ignoreElements()),
                    exporter
                        .connect$(exportSettings$, summary$, status$, files$)
                        .pipe(ignoreElements()),
                    strip.seeks$.pipe(
                        withLatestFrom(geometry$),
                        map(([x, geometry]): AppInput => ({
                            kind: 'scrub',
                            at: frameAtX(x, geometry) / geometry.frames,
                        })),
                    ),
                    merge(
                        controls.changes$.pipe(
                            withLatestFrom(settings$),
                            map(([change, current]) => withControl(current, change)),
                        ),
                        merge(
                            sketch.orbits$,
                            controls.resets$.pipe(map((): OrbitAction => ({ kind: 'reset' }))),
                        ).pipe(
                            withLatestFrom(settings$),
                            map(([action, current]) => ({
                                ...current,
                                orbit: reduceOrbit(current.orbit, action),
                            })),
                        ),
                        stripZooms$.pipe(
                            withLatestFrom(settings$),
                            map(([{ level }, current]) => ({ ...current, stripLevel: level })),
                        ),
                        exporter.changes$.pipe(
                            withLatestFrom(settings$),
                            map(([change, current]) => ({
                                ...current,
                                export: withExportChange(current.export, change),
                            })),
                        ),
                    ).pipe(map(changed)),
                    compiled$.pipe(
                        withLatestFrom(formula$),
                        map(([result, formula]): AppInput => ({
                            kind: 'diagnostic',
                            formula,
                            message: result.ok ? null : result.message,
                        })),
                    ),
                );
            },
        };
    },
};
