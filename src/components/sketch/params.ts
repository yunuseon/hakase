import type { Size } from '../window/frame.ts';
import type { Theme } from './theme.ts';

export type PanelParams = {
    dimension: number;
    depthScalar: number;
    baseSize: number;
};

export type SketchParams = Size & PanelParams & { readonly theme: Theme };

export const defaultParams: PanelParams = {
    dimension: 32,
    depthScalar: 1,
    baseSize: 5,
};
