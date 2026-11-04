import { copiesOf, isSymmetry, type Point, type Symmetry } from '../../shared/brush.ts';
import { sameWave, waveAt, waveOf, type Signal, type Wave } from '../../shared/signal.ts';
import { INK_SIDE, type Stroke } from '../../shared/stroke.ts';

export const PEN_PARAMS = ['x', 'y', 'size', 'ink'] as const;
export type PenParam = (typeof PEN_PARAMS)[number];
export const isPenParam = (value: string): value is PenParam =>
    PEN_PARAMS.some(param => param === value);

export const MODES = ['whole', 'draw'] as const;
export type Mode = (typeof MODES)[number];
export const isMode = (value: string): value is Mode => MODES.some(mode => mode === value);

export const MIN_WEIGHT = 0.25;
export const MAX_WEIGHT = 12;

export type Pen = {
    readonly weight: number;
    readonly mode: Mode;
    readonly symmetry: Symmetry;
    readonly sources: Readonly<Record<PenParam, string | null>>;
};

const unsourced = { x: null, y: null, size: null, ink: null };

export const defaultPen: Pen = {
    weight: 2,
    mode: 'draw',
    symmetry: 'none',
    sources: unsourced,
};

export type PenCommand =
    | { readonly kind: 'mode'; readonly mode: Mode }
    | { readonly kind: 'weight'; readonly weight: number }
    | { readonly kind: 'symmetry'; readonly symmetry: Symmetry }
    | { readonly kind: 'source'; readonly param: PenParam; readonly source: string | null };

export const reducePen = (pen: Pen, command: PenCommand): Pen => {
    switch (command.kind) {
        case 'mode':
            return command.mode === pen.mode ? pen : { ...pen, mode: command.mode };
        case 'weight': {
            const weight = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, command.weight));

            return Number.isFinite(weight) && weight !== pen.weight ? { ...pen, weight } : pen;
        }
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

const WEIGHT_UNIT = 1 / 64;
const HARDNESS = 0.6;

type Mark = { readonly at: Point; readonly t: number };

export const strokeOf = (drawing: Drawing): Stroke => {
    const { weight, mode, symmetry } = drawing.pen;
    const { size, ink } = drawing.waves;
    const dabs: number[] = [];
    const lay = (at: Point, radius: number, flow: number, t: number) => {
        for (const copy of copiesOf(at, symmetry)) {
            dabs.push(copy.x, copy.y, radius, flow, t);
        }
    };
    let last: Mark | null = null;

    for (let index = 0; index <= SAMPLES; index += 1) {
        const t = index / SAMPLES;
        const at = penAt(drawing, t);
        const radius =
            ((size === null ? weight : weight * Math.max(0, waveAt(size, t))) * WEIGHT_UNIT) / 2;
        const flow = ink === null ? 1 : Math.min(1, Math.max(0, waveAt(ink, t)));
        // Stamped by distance, not per sample: a slow pen would otherwise lay hundreds of dabs on one spot.
        const spacing = Math.max(radius / 3, 0.5 / INK_SIDE);

        if (radius <= 0 || flow <= 0) {
            last = null;
        } else if (last === null) {
            lay(at, radius, flow, t);
            last = { at, t };
        } else {
            const from: Mark = last;
            const count = Math.floor(Math.hypot(at.x - from.at.x, at.y - from.at.y) / spacing);

            for (let step = 1; step <= count; step += 1) {
                const along = step / count;

                lay(
                    {
                        x: from.at.x + (at.x - from.at.x) * along,
                        y: from.at.y + (at.y - from.at.y) * along,
                    },
                    radius,
                    flow,
                    from.t + (t - from.t) * along,
                );
            }

            last = count > 0 ? { at, t } : from;
        }
    }

    return { dabs: Float32Array.from(dabs), whole: mode === 'whole', hardness: HARDNESS };
};

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

export const parsePen = (value: unknown): Pen => {
    if (typeof value !== 'object' || value === null) {
        return defaultPen;
    }

    const weight = field(value, 'weight');
    const mode = field(value, 'mode');
    const symmetry = field(value, 'symmetry');
    const sources = field(value, 'sources');
    const source = (param: PenParam) => {
        const read = typeof sources === 'object' && sources !== null ? field(sources, param) : null;

        return typeof read === 'string' ? read : null;
    };

    return {
        weight:
            typeof weight === 'number' && Number.isFinite(weight)
                ? Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, weight))
                : defaultPen.weight,
        mode: typeof mode === 'string' && isMode(mode) ? mode : defaultPen.mode,
        symmetry:
            typeof symmetry === 'string' && isSymmetry(symmetry) ? symmetry : defaultPen.symmetry,
        sources: { x: source('x'), y: source('y'), size: source('size'), ink: source('ink') },
    };
};
