import { combineLatest, EMPTY, merge, of } from 'rxjs';
import {
    distinctUntilChanged,
    ignoreElements,
    map,
    mergeMap,
    shareReplay,
    switchMap,
    withLatestFrom,
} from 'rxjs/operators';
import { HksFpsCounter } from '../components/fps-counter/fps-counter.component.ts';
import { compileFormula$ } from '../components/sketch/compile.ts';
import { formulas, isFormulaName } from '../components/sketch/formulas/registry.ts';
import { HksSketch } from '../components/sketch/sketch.component.ts';
import type { AppInput, Program } from '../program.ts';
import { HksSketchControls } from '../components/sketch/controls/sketch-controls.component.ts';
import type { PanelParams, SketchParams } from '../components/sketch/params.ts';
import type { Size } from '../components/window/frame.ts';

const sameSize = (a: Size, b: Size): boolean => a.width === b.width && a.height === b.height;

export const sketchProgram: Program = {
    id: 'sketch',
    title: 'sketch',
    kind: 'fitted',
    icon: 'M3 14 Q 7.5 5.5 12 13 T 21 11',
    size: { width: 640, height: 640 },
    launch: () => {
        const sketch = new HksSketch();

        const fpsCounter = new HksFpsCounter();
        fpsCounter.slot = 'status';

        const controls = new HksSketchControls().presets(
            Object.entries(formulas).map(([value, { label }]) => ({ value, label })),
        );
        controls.slot = 'controls';
        sketch.append(fpsCounter, controls);

        return {
            element: sketch,
            run$: ({ playhead$, source$ }, { frame$ }) => {
                // Without the comparator, dragging the window would re-prepare the shader.
                const size$ = frame$.pipe(
                    map(({ width, height }): Size => ({ width, height })),
                    distinctUntilChanged(sameSize),
                );

                // Per process: this window's own knobs, not a panel every sketch shares.
                const panel$ = controls.changes$.pipe(
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                const params$ = combineLatest([panel$, size$]).pipe(
                    map(([panel, size]: [PanelParams, Size]): SketchParams => ({
                        ...panel,
                        ...size,
                    })),
                );

                // This window's choice; the text behind it is shared with whoever matches.
                const formula$ = controls.selections$.pipe(
                    mergeMap(name => (isFormulaName(name) ? of(name) : EMPTY)),
                    distinctUntilChanged(),
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                // Per process: each canvas has its own GL context to compile into.
                const compiled$ = compileFormula$(
                    sketch.gl,
                    formula$.pipe(
                        switchMap(name =>
                            source$(name).pipe(
                                map(({ text }) => text),
                                distinctUntilChanged(),
                            ),
                        ),
                    ),
                ).pipe(shareReplay({ bufferSize: 1, refCount: true }));

                const shader$ = compiled$.pipe(
                    // A failure simply does not emit, so the canvas keeps the last shader.
                    mergeMap(result => (result.ok ? of(result.sketch) : EMPTY)),
                );

                return merge(
                    sketch.connect$(params$, playhead$, shader$).pipe(ignoreElements()),
                    fpsCounter.connect$(playhead$).pipe(ignoreElements()),
                    controls.connect$(panel$).pipe(ignoreElements()),
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
