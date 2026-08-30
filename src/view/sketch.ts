import { combineLatest, type Observable } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { TAU } from '../lib/math.ts';
import { devicePixelRatio$ } from '../lib/rx.ts';
import type { SketchParams } from '../model/params.ts';
import { projectVector } from '../model/projection.ts';
import { formulas } from '../model/formulas/registry.ts';
import { applyGeometry, createSurface, type SurfaceGeometry } from './canvas.ts';

const sameGeometry = (a: SurfaceGeometry, b: SurfaceGeometry): boolean =>
    a.width === b.width && a.height === b.height && a.ratio === b.ratio;

const depthColor = (z: number, params: SketchParams): string => {
    if (z < 0.33) return params.color1;
    if (z < 0.66) return params.color2;
    return params.color3;
};

const drawCircle = (
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string,
): void => {
    context.beginPath();
    context.arc(x, y, radius, 0, TAU, false);
    context.fillStyle = color;
    context.fill();
};

const paint = (context: CanvasRenderingContext2D, params: SketchParams, playhead: number): void => {
    context.fillStyle = params.color1;
    context.fillRect(0, 0, params.width, params.height);

    const { dimension } = params;
    const { apply } = formulas[params.formula];

    for (let i = -dimension; i < dimension; i++) {
        for (let j = -dimension; j < dimension; j++) {
            const vector = apply(i / dimension, j / dimension, playhead);
            const projected = projectVector(vector, params);

            drawCircle(
                context,
                projected.x,
                projected.y,
                projected.w / 2,
                depthColor(vector.z, params),
            );
        }
    }
};

export const createSketchView = (container: HTMLElement) => {
    const surface = createSurface(container);

    return {
        connect$: (
            params$: Observable<SketchParams>,
            playhead$: Observable<number>,
        ): Observable<void> => {
            const surface$ = combineLatest([params$, devicePixelRatio$]).pipe(
                map(([{ width, height }, ratio]) => ({ width, height, ratio })),
                distinctUntilChanged(sameGeometry),
                tap(geometry => {
                    applyGeometry(surface, geometry);
                }),
            );

            // surface$ is a dependency, not a step: applying geometry clears the
            // canvas, so every resize has to force a redraw.
            return combineLatest([params$, playhead$, surface$]).pipe(
                tap(([params, playhead]) => {
                    paint(surface.context, params, playhead);
                }),
                map(() => undefined),
            );
        },
    };
};
