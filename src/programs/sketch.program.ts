import { combineLatest, EMPTY, merge, of } from 'rxjs';
import { distinctUntilChanged, ignoreElements, map, mergeMap, shareReplay } from 'rxjs/operators';
import { HksFpsCounter } from '../components/fps-counter/fps-counter.component.ts';
import { compileFormula$ } from '../components/sketch/compile.ts';
import { HksSketch } from '../components/sketch/sketch.component.ts';
import type { AppInput, Program } from '../program.ts';
import type { CanvasSize, SketchParams } from '../shared/params.ts';

const sameSize = (a: CanvasSize, b: CanvasSize): boolean =>
    a.width === b.width && a.height === b.height;

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
        sketch.append(fpsCounter);

        return {
            element: sketch,
            run$: ({ panel$, playhead$, source$ }, { frame$ }) => {
                // Without the comparator, dragging the window would re-prepare the shader.
                const size$ = frame$.pipe(
                    map(({ width, height }): CanvasSize => ({ width, height })),
                    distinctUntilChanged(sameSize),
                );

                const params$ = combineLatest([panel$, size$]).pipe(
                    map(([panel, size]): SketchParams => ({ ...panel, ...size })),
                );

                // Per process: each canvas has its own GL context to compile into.
                const compiled$ = compileFormula$(sketch.gl, source$).pipe(
                    shareReplay({ bufferSize: 1, refCount: true }),
                );

                const shader$ = compiled$.pipe(
                    // A failure simply does not emit, so the canvas keeps the last shader.
                    mergeMap(result => (result.ok ? of(result.sketch) : EMPTY)),
                );

                return merge(
                    sketch.connect$(params$, playhead$, shader$).pipe(ignoreElements()),
                    fpsCounter.connect$(playhead$).pipe(ignoreElements()),
                    compiled$.pipe(
                        map((result): AppInput => ({
                            kind: 'diagnostic',
                            message: result.ok ? null : result.message,
                        })),
                    ),
                );
            },
        };
    },
};
