import type { SketchParams } from './params.ts';

export interface Vector {
    x: number;
    y: number;
    z: number;
}

export interface ProjectedVector {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Maps a normalized x in [-1, 1] onto canvas pixels. */
const projectX = (width: number, normalizedX: number): number => (width / 2) * (1 + normalizedX);

/** Maps a normalized y in [-1, 1] onto canvas pixels, flipping to screen space. */
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
