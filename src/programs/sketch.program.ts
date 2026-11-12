import { knobInputs, paintInput, playbackInput, sceneInputs } from '../inputs.ts';
import { asapScheduler, combineLatest, EMPTY, merge, of, type Observable } from 'rxjs';
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
import { reduceOrbit, sameOrbit, type OrbitAction } from '../components/sketch/space.ts';
import { optionsOf } from '../library.ts';
import { themes } from '../components/sketch/themes/registry.ts';
import { HksSketch } from '../components/sketch/sketch.component.ts';
import type { AppInput, Program } from '../program.ts';
import { HksSketchControls } from '../components/sketch/controls/sketch-controls.component.ts';
import { liveReadouts } from '../components/sketch/controls/controls.ts';
import { HksFrameStrip } from '../components/sketch/strip/frame-strip.component.ts';
import { thumbnails$ } from '../components/sketch/strip/thumbnails.ts';
import {
    HksExportPanel,
    type ExportStatus,
    type SavedFile,
} from '../components/sketch/export/export-panel.component.ts';
import { export$, statusOf, still$ } from '../components/sketch/export/export.ts';
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
    DRIVES,
    panelParams,
    type Pointer,
    type SketchParams,
} from '../components/sketch/params.ts';
import { asSketch, controlsView, withControl, type SketchSettings } from '../settings.ts';
import { devicePixelRatio$ } from '../lib/rx.ts';
import { viewRatio$, windowMoment$ } from '../engine/moment.ts';
import { checked$, view$ } from '../engine/view.ts';
import { shownOf } from './output.program.ts';
import type { Size } from '../components/window/frame.ts';

const sameSize = (a: Size, b: Size): boolean => a.width === b.width && a.height === b.height;

export const sketchProgram = {
    id: 'sketch',
    inputs: { playback: playbackInput, ...knobInputs, ...sceneInputs, paint: paintInput },
    title: 'sketch',
    category: 'make',
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
                const { playhead$, zoom$ } = state;
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

                const points$ = state.image$.pipe(
                    mergeMap(image => (image.kind === 'points' ? of(image) : EMPTY)),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                const signals$ = points$.pipe(
                    map(({ drivers }) => drivers),
                    distinctUntilChanged(),
                );

                const params$ = combineLatest([points$, size$]).pipe(
                    map(([{ panel, drivers, sheet, theme }, size]): SketchParams => ({
                        ...panelParams(panel, drivers, sheet),
                        ...size,
                        theme,
                    })),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                const orbit$ = points$.pipe(
                    map(({ orbit }) => orbit),
                    distinctUntilChanged(sameOrbit),
                );

                // This window's choice; the text behind it is shared with whoever matches.
                const formula$ = settings$.pipe(
                    map(({ formula }) => formula),
                    distinctUntilChanged(),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                const text$ = points$.pipe(
                    map(({ source }) => source),
                    distinctUntilChanged(),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                const checks$ = checked$(text$).pipe(
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                const pointer$ = combineLatest([
                    sketch.pointers$.pipe(startWith(centre)),
                    sketch.presses$.pipe(startWith(false), distinctUntilChanged()),
                ]).pipe(map(([{ x, y }, down]): Pointer => ({ x, y, down })));

                const shown$ = view$(
                    points$,
                    windowMoment$(state.clock$, size$, viewRatio$(zoom$), pointer$),
                ).pipe(map(shownOf('This window shows no sketch.')));

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
                                  combineLatest([
                                      params$,
                                      orbit$,
                                      devicePixelRatio$,
                                      state.duration$,
                                  ]).pipe(
                                      map(([params, orbit, ratio, seconds]) => ({
                                          params,
                                          orbit,
                                          ratio,
                                          seconds,
                                      })),
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
                        withLatestFrom(request$, playhead$, state.duration$),
                        exhaustMap(([, request, t, seconds]) => still$({ ...request, seconds }, t)),
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
                    sketch.connect$(shown$).pipe(ignoreElements()),
                    fpsCounter.connect$(playhead$).pipe(ignoreElements()),
                    controls
                        .connect$(
                            settings$.pipe(map(controlsView)),
                            checks$.pipe(mergeMap(check => (check.ok ? of(check.knobs) : EMPTY))),
                            state.library$.pipe(map(optionsOf)),
                            signals$.pipe(
                                map(signals => DRIVES.filter(drive => signals[drive] !== null)),
                            ),
                            params$.pipe(
                                switchMap(params =>
                                    DRIVES.some(drive => params.signals[drive] !== null)
                                        ? playhead$.pipe(map(t => liveReadouts(params, t)))
                                        : of(new Map<string, string>()),
                                ),
                            ),
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
                        map(([{ phase, x }, geometry]): AppInput => ({
                            kind: 'scrub',
                            phase,
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
                    checks$.pipe(
                        withLatestFrom(formula$),
                        map(([check, formula]): AppInput => ({
                            kind: 'diagnostic',
                            formula,
                            message: check.ok ? null : check.message,
                        })),
                    ),
                );
            },
        };
    },
} satisfies Program;
