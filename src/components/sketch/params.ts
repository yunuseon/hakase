import type { Size } from '../window/frame.ts';
import type { Theme } from './theme.ts';

export const DRAW_MODES = ['dots', 'lines', 'surface'] as const;

export type DrawMode = (typeof DRAW_MODES)[number];

export const isDrawMode = (value: string): value is DrawMode =>
    DRAW_MODES.some(mode => mode === value);

export type DotStyle = {
    readonly mode: 'dots';
    readonly baseSize: number;
    readonly depthScalar: number;
};

export type DrawStyle = DotStyle | { readonly mode: Exclude<DrawMode, 'dots'> };

export type PanelParams = {
    readonly dimension: number;
    readonly draw: DrawStyle;
};

export type SketchParams = Size & PanelParams & { readonly theme: Theme };

export const defaultDimension = 32;

export const defaultDots: DotStyle = {
    mode: 'dots',
    baseSize: 5,
    depthScalar: 1,
};

const RATIO_STEP = 0.25;
const MAX_BUFFER = 2048;

// Stepped, or every wheel tick of a zoom reallocates the drawing buffer (~7ms each).
export const steppedRatio = (pixelRatio: number, zoom: number): number =>
    Math.max(RATIO_STEP, Math.round((pixelRatio * zoom) / RATIO_STEP) * RATIO_STEP);

export const cappedRatio = (ratio: number, { width, height }: Size): number =>
    Math.min(ratio, MAX_BUFFER / Math.max(width, height, 1));
