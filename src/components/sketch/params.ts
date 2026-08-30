import type { Size } from '../window/frame.ts';

export type PanelParams = {
    dimension: number;
    depthScalar: number;
    baseSize: number;

    color1: string;
    color2: string;
    color3: string;
};

export type SketchParams = Size & PanelParams;

export const defaultParams: PanelParams = {
    dimension: 32,
    depthScalar: 1,
    baseSize: 5,

    color1: '#222831',
    color2: '#393e46',
    color3: '#00ADB5',
};
