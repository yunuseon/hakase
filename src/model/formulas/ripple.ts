import type { Formula } from '../formula.ts';

const DIAGONAL = Math.SQRT2;

export const rippleAt: Formula = (x, y, playhead) => {
    const depth = Math.hypot(x, y) / DIAGONAL;
    const wave = Math.sin(2 * (depth + playhead) * Math.PI);

    return { x, y: y * ((wave + depth) / 2), z: depth };
};
