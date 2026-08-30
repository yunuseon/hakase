import { combineLatest, EMPTY, merge, of } from 'rxjs';
import { distinctUntilChanged, map, mergeMap } from 'rxjs/operators';
import { HksFpsCounter } from '../components/fps-counter/fps-counter.component.ts';
import { HksSketch } from '../components/sketch/sketch.component.ts';
import type { Program } from '../program.ts';
import type { CanvasSize, SketchParams } from '../shared/params.ts';

export const sketch = new HksSketch();

const fpsCounter = new HksFpsCounter();
fpsCounter.slot = 'status';
sketch.append(fpsCounter);

const sameSize = (a: CanvasSize, b: CanvasSize): boolean =>
    a.width === b.width && a.height === b.height;

export const sketchProgram: Program = {
    id: 'sketch',
    title: 'sketch',
    kind: 'fitted',
    content: sketch,
    connect$: ({ panel$, frame$, playhead$, compiled$ }) => {
        // Without the comparator, dragging the window would re-prepare the shader.
        const size$ = frame$('sketch').pipe(
            map(({ width, height }): CanvasSize => ({ width, height })),
            distinctUntilChanged(sameSize),
        );

        const params$ = combineLatest([panel$, size$]).pipe(
            map(([panel, size]): SketchParams => ({ ...panel, ...size })),
        );

        const shader$ = compiled$.pipe(
            // A failure simply does not emit, so the canvas keeps the last shader.
            mergeMap(result => (result.ok ? of(result.sketch) : EMPTY)),
        );

        return merge(sketch.connect$(params$, playhead$, shader$), fpsCounter.connect$(playhead$));
    },
};
