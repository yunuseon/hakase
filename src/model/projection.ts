import type { SketchParams } from './params.ts';
import type { Vector } from './vector.ts';

export type ProjectedVector = {
    x: number;
    y: number;
    w: number;
    h: number;
};

const projectX = (width: number, normalizedX: number): number => (width / 2) * (1 + normalizedX);

const projectY = (height: number, normalizedY: number): number => (1 - normalizedY) * (height / 2);

export const projectVector = ({ x, y, z }: Vector, params: SketchParams): ProjectedVector => {
    const size = z * params.depthScalar * params.baseSize;

    return {
        x: projectX(params.width, x),
        y: projectY(params.height, y),
        w: size,
        h: size,
    };
};
