export const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max);

/** Wraps a value into the half-open interval [0, 1). */
export const wrap01 = (value: number): number => ((value % 1) + 1) % 1;

export const TAU = 2 * Math.PI;
