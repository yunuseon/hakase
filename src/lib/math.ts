export const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max);

export const wrap01 = (value: number): number => ((value % 1) + 1) % 1;

export const TAU = 2 * Math.PI;
