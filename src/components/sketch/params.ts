import type { Size } from '../window/frame.ts';
import type { Fit, Lattice, Lens, Space } from './space.ts';
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

export const KNOBS = ['k1', 'k2', 'k3', 'k4'] as const;

export type Knob = (typeof KNOBS)[number];

export const isKnob = (value: string): value is Knob => KNOBS.some(knob => knob === value);

export type Knobs = Readonly<Record<Knob, number>>;

export const defaultKnob = 0.5;

// Whole numbers only: a knob that swings a whole number of times per loop ends where it began.
export const CYCLES = [0, 1, 2, 4, 8] as const;

export type Cycles = (typeof CYCLES)[number];

export const isCycles = (value: number): value is Cycles => CYCLES.some(cycles => cycles === value);

export type Motion = Readonly<Record<Knob, Cycles>>;

export const knobAt = (value: number, cycles: Cycles, t: number): number =>
    cycles === 0 ? value : value * (0.5 - 0.5 * Math.cos(2 * Math.PI * cycles * t));

export type PanelParams = {
    readonly dimension: number;
    readonly draw: DrawStyle;
    readonly knobs: Knobs;
    readonly axes: boolean;
    readonly fit: Fit;
    readonly lens: Lens;
    readonly lattice: Lattice;
    readonly focus: number;
    readonly space: Space;
    readonly trails: number;
    readonly motion: Motion;
};

// Flat, unlike PanelParams: a dot setting must outlive a switch to lines, so it is kept, not dropped.
export type Panel = {
    readonly mode: DrawMode;
    readonly dimension: number;
    readonly baseSize: number;
    readonly depthScalar: number;
    readonly knobs: Knobs;
    readonly axes: boolean;
    readonly fit: Fit;
    readonly lens: Lens;
    readonly lattice: Lattice;
    readonly focus: number;
    readonly space: Space;
    readonly trails: number;
    readonly motion: Motion;
};

export const sameKnobs = (a: Knobs, b: Knobs): boolean => KNOBS.every(knob => a[knob] === b[knob]);

export const samePanel = (a: Panel, b: Panel): boolean =>
    a.mode === b.mode &&
    a.dimension === b.dimension &&
    a.baseSize === b.baseSize &&
    a.depthScalar === b.depthScalar &&
    sameKnobs(a.knobs, b.knobs) &&
    a.axes === b.axes &&
    a.fit === b.fit &&
    a.lens === b.lens &&
    a.lattice === b.lattice &&
    a.focus === b.focus &&
    a.space === b.space &&
    a.trails === b.trails &&
    KNOBS.every(knob => a.motion[knob] === b.motion[knob]);

export const panelParams = ({
    mode,
    dimension,
    baseSize,
    depthScalar,
    knobs,
    axes,
    fit,
    lens,
    lattice,
    focus,
    space,
    trails,
    motion,
}: Panel): PanelParams => ({
    dimension,
    draw: mode === 'dots' ? { mode, baseSize, depthScalar } : { mode },
    knobs,
    axes,
    fit,
    lens,
    lattice,
    focus,
    space,
    trails,
    motion,
});

export type Pointer = {
    readonly x: number;
    readonly y: number;
    readonly down: boolean;
};

export const centre: Pointer = { x: 0, y: 0, down: false };

export const pointerAt = (
    clientX: number,
    clientY: number,
    {
        left,
        top,
        width,
        height,
    }: {
        readonly left: number;
        readonly top: number;
        readonly width: number;
        readonly height: number;
    },
): Omit<Pointer, 'down'> => ({
    x: width === 0 ? 0 : ((clientX - left) / width) * 2 - 1,
    y: height === 0 ? 0 : 1 - ((clientY - top) / height) * 2,
});

export const samePointer = (a: Pointer, b: Pointer): boolean =>
    a.x === b.x && a.y === b.y && a.down === b.down;

export type SketchParams = Size & PanelParams & { readonly theme: Theme };

export const defaultDimension = 32;

export const defaultDots: DotStyle = {
    mode: 'dots',
    baseSize: 5,
    depthScalar: 1,
};

export const defaultPanel: Panel = {
    ...defaultDots,
    dimension: defaultDimension,
    knobs: { k1: defaultKnob, k2: defaultKnob, k3: defaultKnob, k4: defaultKnob },
    axes: false,
    fit: 'contain',
    lens: 'perspective',
    lattice: 'grid',
    focus: 1,
    space: 'cartesian',
    trails: 0,
    motion: { k1: 0, k2: 0, k3: 0, k4: 0 },
};

const RATIO_STEP = 0.25;
const MAX_BUFFER = 2048;

// Stepped, or every wheel tick of a zoom reallocates the drawing buffer (~7ms each).
export const steppedRatio = (pixelRatio: number, zoom: number): number =>
    Math.max(RATIO_STEP, Math.round((pixelRatio * zoom) / RATIO_STEP) * RATIO_STEP);

export const cappedRatio = (ratio: number, { width, height }: Size): number =>
    Math.min(ratio, MAX_BUFFER / Math.max(width, height, 1));
