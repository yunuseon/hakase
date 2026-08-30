import type { FormulaName } from '../components/sketch/formulas/registry.ts';

export type CanvasSize = {
    readonly width: number;
    readonly height: number;
};

export type PanelParams = {
    dimension: number;
    gapModifier: number;
    depthScalar: number;
    baseSize: number;

    color1: string;
    color2: string;
    color3: string;
    color4: string;
};

export type SketchParams = CanvasSize & PanelParams;

export const sketchParams: SketchParams & { formula: FormulaName } = {
    height: 640,
    width: 640,

    formula: 'ripple',
    dimension: 32,
    gapModifier: 0.1,
    depthScalar: 1,
    baseSize: 5,

    color1: '#222831',
    color2: '#393e46',
    color3: '#00ADB5',
    color4: '#EEEEEE',
};

export const timelineParams = {
    duration: 8,
};

export type TimelineParams = typeof timelineParams;
