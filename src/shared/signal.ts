import { wrap01 } from '../lib/math.ts';

export const SHAPES = ['sine', 'triangle', 'saw', 'square', 'noise'] as const;
export type Shape = (typeof SHAPES)[number];
export const isShape = (value: string): value is Shape => SHAPES.some(shape => shape === value);

// Whole numbers only: a signal that runs a whole number of cycles per loop ends where it began.
export const RATES = [1, 2, 3, 4, 6, 8, 16] as const;
export type Rate = (typeof RATES)[number];
export const isRate = (value: number): value is Rate => RATES.some(rate => rate === value);

// Not rate: a rate that moved would stop being a whole number of cycles, and the loop would not loop.
export const PARAMS = ['phase', 'offset', 'depth'] as const;
export type Param = (typeof PARAMS)[number];
export const isParam = (value: string): value is Param => PARAMS.some(param => param === value);

export type Sources = Readonly<Record<Param, string | null>>;

export type Signal = {
    readonly shape: Shape;
    readonly rate: Rate;
    readonly phase: number;
    readonly offset: number;
    readonly depth: number;
    readonly sources: Sources;
};

const unsourced: Sources = { phase: null, offset: null, depth: null };

export const defaultSignal: Signal = {
    shape: 'sine',
    rate: 1,
    phase: 0,
    offset: 0.5,
    depth: 0.5,
    sources: unsourced,
};

export type SignalCommand =
    | { readonly kind: 'shape'; readonly shape: Shape }
    | { readonly kind: 'rate'; readonly rate: Rate }
    | { readonly kind: 'set'; readonly param: Param; readonly value: number }
    // Relative, so a control reports how far it was dragged and never reads the value it moves.
    | { readonly kind: 'nudge'; readonly param: Param; readonly by: number }
    | { readonly kind: 'drag-wave'; readonly dx: number; readonly dy: number }
    | { readonly kind: 'source'; readonly param: Param; readonly source: string | null };

const withParam = (signal: Signal, param: Param, value: number): Signal =>
    !Number.isFinite(value)
        ? signal
        : param === 'phase'
          ? { ...signal, phase: wrap01(value) }
          : { ...signal, [param]: value };

export const reduceSignal = (signal: Signal, command: SignalCommand): Signal => {
    switch (command.kind) {
        case 'shape':
            return { ...signal, shape: command.shape };
        case 'rate':
            return { ...signal, rate: command.rate };
        case 'set':
            return withParam(signal, command.param, command.value);
        case 'nudge':
            return withParam(signal, command.param, signal[command.param] + command.by);
        case 'drag-wave':
            return withParam(
                withParam(signal, 'offset', signal.offset - command.dy * spanOf(signal)),
                'phase',
                signal.phase - command.dx * signal.rate,
            );
        case 'source':
            return { ...signal, sources: { ...signal.sources, [command.param]: command.source } };
    }
};

// What the plot spans for a signal of no depth, so a flat line can still be dragged.
const spanOf = ({ depth }: Signal) => Math.max(2 * Math.abs(depth), 1);

const NOISE_POINTS = 4;

const hashed = (index: number) => {
    const x = Math.sin(index * 127.1 + 311.7) * 43758.5453;

    return x - Math.floor(x);
};

const wave = (shape: Shape, rate: Rate, cycle: number) => {
    const at = cycle - Math.floor(cycle);

    switch (shape) {
        case 'sine':
            return 0.5 - 0.5 * Math.cos(2 * Math.PI * at);
        case 'triangle':
            return 1 - Math.abs(2 * at - 1);
        case 'saw':
            return at;
        case 'square':
            return at < 0.5 ? 0 : 1;
        case 'noise': {
            // Wrapped by the loop's point count, so the last point eases back into the first.
            const count = rate * NOISE_POINTS;
            const position = (cycle * NOISE_POINTS) % count;
            const index = Math.floor(position);
            const blend = position - index;
            const eased = blend * blend * (3 - 2 * blend);

            return hashed(index) + (hashed((index + 1) % count) - hashed(index)) * eased;
        }
    }
};

export const signalAt = ({ shape, rate, phase, offset, depth }: Signal, t: number) =>
    offset + depth * (2 * wave(shape, rate, rate * t + phase) - 1);

export type Wave = {
    readonly signal: Signal;
    readonly mods: Readonly<Record<Param, Wave | null>>;
};

// A store already seen up the chain is not followed again: a loop that slipped in through storage stops there.
export const waveOf = (
    all: ReadonlyMap<string, Signal>,
    id: string,
    seen: ReadonlySet<string> = new Set(),
): Wave => {
    const signal = all.get(id) ?? defaultSignal;
    const below = new Set([...seen, id]);
    const mod = (param: Param) => {
        const source = signal.sources[param];

        return source === null || below.has(source) ? null : waveOf(all, source, below);
    };

    return { signal, mods: { phase: mod('phase'), offset: mod('offset'), depth: mod('depth') } };
};

export const waveAt = ({ signal, mods }: Wave, t: number): number =>
    signalAt(
        {
            ...signal,
            phase: mods.phase === null ? signal.phase : waveAt(mods.phase, t),
            offset: mods.offset === null ? signal.offset : waveAt(mods.offset, t),
            depth: mods.depth === null ? signal.depth : waveAt(mods.depth, t),
        },
        t,
    );

// By reference on each signal: the fold makes a new one only when it changed.
export const sameWave = (a: Wave, b: Wave): boolean =>
    a.signal === b.signal &&
    PARAMS.every(param => {
        const x = a.mods[param];
        const y = b.mods[param];

        return x === null || y === null ? x === y : sameWave(x, y);
    });

export const reachedFrom = (
    all: ReadonlyMap<string, Signal>,
    roots: Iterable<string>,
): ReadonlySet<string> => {
    const step = (found: ReadonlySet<string>): ReadonlySet<string> => {
        const next = new Set([
            ...found,
            ...[...found].flatMap(id => {
                const { sources } = all.get(id) ?? defaultSignal;

                return PARAMS.flatMap(param => {
                    const source = sources[param];

                    return source === null ? [] : [source];
                });
            }),
        ]);

        return next.size === found.size ? found : step(next);
    };

    return step(new Set(roots));
};

export const closesLoop = (all: ReadonlyMap<string, Signal>, target: string, source: string) =>
    reachedFrom(all, [source]).has(target);

export const samplesOf = (wave: Wave, count: number) =>
    Array.from({ length: count + 1 }, (_, index) => waveAt(wave, index / count));

const finiteOr = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

// Saved as low and high before signals were offset and depth: the same wave, rewritten.
const LEGACY: Readonly<Record<Param, string>> = { phase: 'phase', offset: 'low', depth: 'high' };

const sourcesFrom = (value: unknown): Sources => {
    if (typeof value !== 'object' || value === null) {
        return unsourced;
    }

    const source = (param: Param) => {
        const id = field(value, param) ?? field(value, LEGACY[param]);

        return typeof id === 'string' ? id : null;
    };

    return { phase: source('phase'), offset: source('offset'), depth: source('depth') };
};

export const parseSignal = (value: unknown): Signal => {
    if (typeof value !== 'object' || value === null) {
        return defaultSignal;
    }

    const shape = field(value, 'shape');
    const rate = field(value, 'rate');
    const low = finiteOr(field(value, 'low'), 0);
    const high = finiteOr(field(value, 'high'), 1);

    return {
        shape: typeof shape === 'string' && isShape(shape) ? shape : defaultSignal.shape,
        rate: typeof rate === 'number' && isRate(rate) ? rate : defaultSignal.rate,
        phase: wrap01(finiteOr(field(value, 'phase'), defaultSignal.phase)),
        offset: finiteOr(field(value, 'offset'), (low + high) / 2),
        depth: finiteOr(field(value, 'depth'), (high - low) / 2),
        sources: sourcesFrom(field(value, 'sources')),
    };
};
