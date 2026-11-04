import {
    isSymmetry,
    rounded,
    spacingOf,
    strokeInto,
    type Point,
    type Symmetry,
} from '../../shared/brush.ts';
import { blank, isSide, type Frame, type Picture, type Side } from '../../shared/picture.ts';
import { sameWave, waveAt, waveOf, type Signal, type Wave } from '../../shared/signal.ts';

export const PEN_PARAMS = ['x', 'y', 'size', 'ink'] as const;
export type PenParam = (typeof PEN_PARAMS)[number];
export const isPenParam = (value: string): value is PenParam =>
    PEN_PARAMS.some(param => param === value);

export const MODES = ['whole', 'draw'] as const;
export type Mode = (typeof MODES)[number];
export const isMode = (value: string): value is Mode => MODES.some(mode => mode === value);

export const MAX_WEIGHT = 12;

export type Pen = {
    readonly side: Side;
    readonly weight: number;
    readonly mode: Mode;
    readonly symmetry: Symmetry;
    readonly sources: Readonly<Record<PenParam, string | null>>;
};

const unsourced = { x: null, y: null, size: null, ink: null };

export const defaultPen: Pen = {
    side: 64,
    weight: 2,
    mode: 'draw',
    symmetry: 'none',
    sources: unsourced,
};

export type PenCommand =
    | { readonly kind: 'mode'; readonly mode: Mode }
    | { readonly kind: 'weight'; readonly weight: number }
    | { readonly kind: 'side'; readonly side: Side }
    | { readonly kind: 'symmetry'; readonly symmetry: Symmetry }
    | { readonly kind: 'source'; readonly param: PenParam; readonly source: string | null };

export const reducePen = (pen: Pen, command: PenCommand): Pen => {
    switch (command.kind) {
        case 'mode':
            return command.mode === pen.mode ? pen : { ...pen, mode: command.mode };
        case 'weight': {
            const weight = Math.min(MAX_WEIGHT, Math.max(0.5, command.weight));

            return Number.isFinite(weight) && weight !== pen.weight ? { ...pen, weight } : pen;
        }
        case 'side':
            return command.side === pen.side ? pen : { ...pen, side: command.side };
        case 'symmetry':
            return command.symmetry === pen.symmetry ? pen : { ...pen, symmetry: command.symmetry };
        case 'source':
            return pen.sources[command.param] === command.source
                ? pen
                : { ...pen, sources: { ...pen.sources, [command.param]: command.source } };
    }
};

export type PenWaves = Readonly<Record<PenParam, Wave | null>>;

export type Drawing = { readonly pen: Pen; readonly waves: PenWaves };

export const drawingOf = (pen: Pen, signals: ReadonlyMap<string, Signal>): Drawing => {
    const wave = (param: PenParam) => {
        const source = pen.sources[param];

        return source === null ? null : waveOf(signals, source);
    };

    return {
        pen,
        waves: { x: wave('x'), y: wave('y'), size: wave('size'), ink: wave('ink') },
    };
};

export const sameDrawing = (a: Drawing, b: Drawing) =>
    a.pen === b.pen &&
    PEN_PARAMS.every(param => {
        const x = a.waves[param];
        const y = b.waves[param];

        return x === null || y === null ? x === y : sameWave(x, y);
    });

export const penAt = ({ waves }: Drawing, t: number) => ({
    x: waves.x === null ? 0.5 + 0.35 * Math.cos(2 * Math.PI * t) : waveAt(waves.x, t),
    y: 1 - (waves.y === null ? 0.5 + 0.35 * Math.sin(2 * Math.PI * t) : waveAt(waves.y, t)),
});

export const SAMPLES = 720;
export const DRAW_FRAMES = 24;

export const traced = (drawing: Drawing): Picture => {
    const { side, weight, mode, symmetry } = drawing.pen;
    const { size, ink } = drawing.waves;

    const working = [...blank(side)];
    const frames: Frame[] = [];
    let last: Point | null = null;

    // Stamped by distance, not per sample: a slow pen would otherwise lay hundreds of discs on one spot.
    for (let index = 0; index <= SAMPLES; index += 1) {
        const t = index / SAMPLES;
        const at = penAt(drawing, t);
        const brush = {
            tool: 'brush' as const,
            size: size === null ? weight : weight * Math.max(0, waveAt(size, t)),
            hardness: 0.6,
            flow: ink === null ? 1 : Math.min(1, Math.max(0, waveAt(ink, t))),
        };
        const boundary =
            index > 0 &&
            Math.floor((index * DRAW_FRAMES) / SAMPLES) >
                Math.floor(((index - 1) * DRAW_FRAMES) / SAMPLES);

        if (brush.size <= 0 || brush.flow <= 0) {
            last = null;
        } else if (last === null) {
            strokeInto(working, working, side, at, at, brush, symmetry, true);
            last = at;
        } else if (
            boundary ||
            Math.hypot((at.x - last.x) * side, (at.y - last.y) * side) >= spacingOf(brush)
        ) {
            strokeInto(working, working, side, last, at, brush, symmetry, true);
            last = at;
        }

        if (mode === 'draw' && boundary) {
            frames.push(rounded(working));
        }
    }

    return mode === 'draw'
        ? { side, frames, fade: true }
        : { side, frames: [rounded(working)], fade: false };
};

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

export const parsePen = (value: unknown): Pen => {
    if (typeof value !== 'object' || value === null) {
        return defaultPen;
    }

    const side = field(value, 'side');
    const weight = field(value, 'weight');
    const mode = field(value, 'mode');
    const symmetry = field(value, 'symmetry');
    const sources = field(value, 'sources');
    const source = (param: PenParam) => {
        const read = typeof sources === 'object' && sources !== null ? field(sources, param) : null;

        return typeof read === 'string' ? read : null;
    };

    return {
        side: typeof side === 'number' && isSide(side) ? side : defaultPen.side,
        weight:
            typeof weight === 'number' && Number.isFinite(weight)
                ? Math.min(MAX_WEIGHT, Math.max(0.5, weight))
                : defaultPen.weight,
        mode: typeof mode === 'string' && isMode(mode) ? mode : defaultPen.mode,
        symmetry:
            typeof symmetry === 'string' && isSymmetry(symmetry) ? symmetry : defaultPen.symmetry,
        sources: { x: source('x'), y: source('y'), size: source('size'), ink: source('ink') },
    };
};
