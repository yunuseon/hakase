import { TAU } from '../lib/math.ts';
import type { SketchParams } from './params.ts';
import { projectVector, type Vector } from './vector.ts';

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

/** Picks a palette entry from the vector's depth. */
const depthColor = (z: number, params: SketchParams): string => {
    if (z < 0.33) return params.color1;
    if (z < 0.66) return params.color2;
    return params.color3;
};

const drawVector = (
    context: CanvasRenderingContext2D,
    params: SketchParams,
    vector: Vector,
): void => {
    const projected = projectVector(vector, params);
    drawCircle(context, projected.x, projected.y, projected.w / 2, depthColor(vector.z, params));
};

const DIAGONAL = Math.SQRT2;

/**
 * A radial ripple: a square lattice of dots whose vertical offset is driven by a
 * sine wave travelling outwards from the centre. `playhead` is in [0, 1).
 */
export const renderSketch = (
    context: CanvasRenderingContext2D,
    params: SketchParams,
    playhead: number,
): void => {
    context.fillStyle = params.color1;
    context.fillRect(0, 0, params.width, params.height);

    const { dimension } = params;

    for (let i = -dimension; i < dimension; i++) {
        for (let j = -dimension; j < dimension; j++) {
            const x = i / dimension;
            const y = j / dimension;
            const radius = Math.hypot(x, y) / DIAGONAL;
            const wave = Math.sin(2 * (radius + playhead) * Math.PI);

            drawVector(context, params, {
                x,
                y: y * ((wave + radius) / 2),
                z: radius,
            });
        }
    }
};
