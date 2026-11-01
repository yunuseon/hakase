import { combineLatest, EMPTY, merge, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    exhaustMap,
    ignoreElements,
    map,
    mergeMap,
    scan,
    share,
    shareReplay,
    startWith,
    switchMap,
    take,
    takeLast,
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
import {
    HksSketchControls,
    type SavedFile,
} from '../components/sketch/controls/sketch-controls.component.ts';
import {
    captureFrames$,
    recordCanvas$,
    snapshot$,
    type CaptureFrame,
} from '../components/sketch/capture.ts';
import {
    centre,
    panelParams,
    samePanel,
    steppedRatio,
    type Panel,
    type Pointer,
    type SketchParams,
} from '../components/sketch/params.ts';
import { asSketch, controlsView, withControl } from '../settings.ts';
import { devicePixelRatio$ } from '../lib/rx.ts';
import type { Size } from '../components/window/frame.ts';

const sameSize = (a: Size, b: Size): boolean => a.width === b.width && a.height === b.height;

type CaptureEvent =
    | { readonly kind: 'frame'; readonly frame: CaptureFrame }
    | { readonly kind: 'done' }
    | { readonly kind: 'file'; readonly blob: Blob };

type Tick = { readonly kind: 'timeline' | 'capture' | 'released'; readonly t: number };

type Clock = { readonly capturing: boolean; readonly t: number | null };

export const sketchProgram: Program = {
    id: 'sketch',
    title: 'sketch',
    kind: 'fitted',
    icon: 'M3 14 Q 7.5 5.5 12 13 T 21 11',
    size: { width: 640, height: 640 },
    minimum: { width: 160, height: 120 },
    launch: () => {
        const sketch = new HksSketch();

        const fpsCounter = new HksFpsCounter();
        fpsCounter.slot = 'status';

        const controls = new HksSketchControls().presets(
            Object.keys(themes).map(value => ({ value, label: value })),
        );
        controls.slot = 'controls';
        sketch.append(fpsCounter, controls);

        return {
            element: sketch,
            run$: (state, { slot$, settings$: stored$ }) => {
                const { playhead$, source$, zoom$ } = state;
                // Without the comparator, dragging the window would re-prepare the shader.
                const size$ = slot$.pipe(
                    map(({ frame: { width, height } }): Size => ({ width, height })),
                    distinctUntilChanged(sameSize),
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
                );

                // This window's choice; the text behind it is shared with whoever matches.
                const formula$ = settings$.pipe(
                    map(({ formula }) => formula),
                    distinctUntilChanged(),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                // Per process: each canvas has its own GL context to compile into.
                const compiled$ = compileFormula$(
                    sketch.gl,
                    formula$.pipe(
                        switchMap(name =>
                            source$(name).pipe(
                                map(({ value }) => value),
                                distinctUntilChanged(),
                            ),
                        ),
                    ),
                ).pipe(shareReplay({ bufferSize: 1, refCount: true }));

                const shader$ = compiled$.pipe(
                    // A failure simply does not emit, so the canvas keeps the last shader.
                    mergeMap(result => (result.ok ? of(result.sketch) : EMPTY)),
                );

                const canvas = sketch.gl.canvas;

                const captures$: Observable<CaptureEvent> = controls.records$.pipe(
                    withLatestFrom(state.duration$, panel$),
                    // exhaustMap: a click while recording is ignored, not a second capture.
                    exhaustMap(([, seconds, panel]) => {
                        if (!(canvas instanceof HTMLCanvasElement)) {
                            return EMPTY;
                        }

                        const frames$ = captureFrames$(seconds, panel.trails > 0).pipe(share());

                        // Frames first: each must be drawn before the recorder asks for it.
                        return merge(
                            frames$.pipe(map((frame): CaptureEvent => ({ kind: 'frame', frame }))),
                            frames$.pipe(
                                takeLast(1),
                                map((): CaptureEvent => ({ kind: 'done' })),
                            ),
                            recordCanvas$(canvas, frames$).pipe(
                                map((blob): CaptureEvent => ({ kind: 'file', blob })),
                            ),
                        );
                    }),
                    share(),
                );

                // While capturing, the capture is this sketch's clock and the timeline is ignored.
                const clock$ = merge(
                    playhead$.pipe(map((t): Tick => ({ kind: 'timeline', t }))),
                    captures$.pipe(
                        mergeMap((event): Observable<Tick> => {
                            switch (event.kind) {
                                case 'frame':
                                    return of({ kind: 'capture', t: event.frame.t });
                                case 'done':
                                    return playhead$.pipe(
                                        take(1),
                                        map((t): Tick => ({ kind: 'released', t })),
                                    );
                                case 'file':
                                    return EMPTY;
                            }
                        }),
                    ),
                ).pipe(
                    scan(
                        (clock: Clock, tick): Clock =>
                            tick.kind === 'timeline'
                                ? { capturing: clock.capturing, t: clock.capturing ? null : tick.t }
                                : { capturing: tick.kind === 'capture', t: tick.t },
                        { capturing: false, t: null },
                    ),
                    mergeMap(({ t }) => (t === null ? EMPTY : of(t))),
                );

                const progress$ = captures$.pipe(
                    mergeMap(event =>
                        event.kind === 'frame'
                            ? of(event.frame.progress)
                            : event.kind === 'done'
                              ? of(null)
                              : EMPTY,
                    ),
                    startWith(null),
                );

                const files$: Observable<SavedFile> = merge(
                    captures$.pipe(
                        mergeMap(event => (event.kind === 'file' ? of(event.blob) : EMPTY)),
                        withLatestFrom(formula$),
                        map(([blob, formula]) => ({
                            blob,
                            name: `hakase-${formula}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`,
                        })),
                    ),
                    controls.snapshots$.pipe(
                        exhaustMap(() =>
                            canvas instanceof HTMLCanvasElement ? snapshot$(canvas) : EMPTY,
                        ),
                        withLatestFrom(formula$),
                        map(([blob, formula]) => ({ blob, name: `hakase-${formula}.png` })),
                    ),
                );

                const ratio$ = combineLatest([devicePixelRatio$, zoom$]).pipe(
                    map(([pixelRatio, zoom]) => steppedRatio(pixelRatio, zoom)),
                    distinctUntilChanged(),
                );

                return merge(
                    sketch
                        .connect$(
                            params$,
                            clock$,
                            shader$,
                            ratio$,
                            combineLatest([
                                sketch.pointers$.pipe(startWith(centre)),
                                sketch.presses$.pipe(startWith(false), distinctUntilChanged()),
                            ]).pipe(map(([{ x, y }, down]): Pointer => ({ x, y, down }))),
                            settings$.pipe(
                                map(({ orbit }) => orbit),
                                distinctUntilChanged(),
                            ),
                        )
                        .pipe(ignoreElements()),
                    fpsCounter.connect$(playhead$).pipe(ignoreElements()),
                    controls
                        .connect$(
                            settings$.pipe(map(controlsView)),
                            shader$.pipe(map(knobsUsed)),
                            state.library$.pipe(map(optionsOf)),
                            progress$,
                            files$,
                        )
                        .pipe(ignoreElements()),
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
                    ).pipe(map((settings): AppInput => ({ kind: 'settings', settings }))),
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
