import { clamp, TAU, wrap01 } from '../lib/math.ts';

export type Point = {
    x: number;
    y: number;
};

export type Ring = {
    trackRadiusX: number;
    trackRadiusY: number;
    indicatorRadiusX: number;
    indicatorRadiusY: number;
};

const ZERO_AT = 0.25;

export const linearValue = (offsetX: number, width: number): number => clamp(offsetX / width, 0, 1);

export const angularValue = (deltaX: number, deltaY: number): number =>
    wrap01(Math.atan2(deltaY, deltaX) / TAU + ZERO_AT);

export const ringOffset = (ring: Ring, value: number): Point => {
    const angle = (value - ZERO_AT) * TAU;

    return {
        x: ring.trackRadiusX - ring.indicatorRadiusX + Math.cos(angle) * ring.trackRadiusX,
        y: ring.trackRadiusY - ring.indicatorRadiusY + Math.sin(angle) * ring.trackRadiusY,
    };
};
