import { combineLatest, type Observable } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { devicePixelRatio$ } from '../lib/rx.ts';
import { formulas } from '../model/formulas/registry.ts';
import type { SketchParams } from '../model/params.ts';
import { applyGeometry, createSurface, type SurfaceGeometry } from './gl/surface.ts';
import { createSketch, drawFrame, prepare, toPalette, type Sketch } from './gl/sketch-program.ts';

const sameGeometry = (a: SurfaceGeometry, b: SurfaceGeometry): boolean =>
    a.width === b.width && a.height === b.height && a.ratio === b.ratio;

export const createSketchView = (container: HTMLElement) => {
    const surface = createSurface(container);

    const compile = (formula: string): Sketch => {
        const result = createSketch(surface.gl, formula);
        if (!result.ok) {
            throw new Error(`Could not compile the sketch shader:\n${result.message}`);
        }

        return result.sketch;
    };

    return {
        connect$: (
            params$: Observable<SketchParams>,
            playhead$: Observable<number>,
        ): Observable<void> => {
            const geometry$ = combineLatest([params$, devicePixelRatio$]).pipe(
                map(([{ width, height }, ratio]) => ({ width, height, ratio })),
                distinctUntilChanged(sameGeometry),
                tap(geometry => {
                    applyGeometry(surface, geometry);
                }),
            );

            const sketch$ = params$.pipe(
                map(({ formula }) => formulas[formula].source),
                distinctUntilChanged(),
                map(compile),
            );

            // Everything the playhead does not affect, derived and uploaded once
            // per change rather than once per frame. It is a dependency of the
            // frame below, not a step inside it: resizing clears the buffer and
            // a new shader loses its uniforms, so both have to force a redraw.
            const prepared$ = combineLatest([params$, sketch$, geometry$]).pipe(
                map(([params, sketch, geometry]) => ({
                    params,
                    sketch,
                    palette: toPalette(params),
                    ratio: geometry.ratio,
                })),
                tap(({ sketch, params, palette, ratio }) => {
                    prepare(surface.gl, sketch, params, palette, ratio);
                }),
            );

            return combineLatest([prepared$, playhead$]).pipe(
                tap(([{ sketch, params }, playhead]) => {
                    drawFrame(surface.gl, sketch, params.dimension, playhead);
                }),
                map(() => undefined),
            );
        },
    };
};
