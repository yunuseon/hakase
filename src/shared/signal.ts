import { clamp, wrap01 } from '../lib/math.ts';

export const SHAPES = ['sine', 'triangle', 'saw', 'square', 'noise', 'steps'] as const;
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

export const TIME = 'time';

export const SOURCE_PARAMS = [...PARAMS, TIME] as const;
export type SourceParam = (typeof SOURCE_PARAMS)[number];
export const isSourceParam = (value: string): value is SourceParam =>
    SOURCE_PARAMS.some(param => param === value);

export const FIELDS = [...PARAMS, 'glide'] as const;
export type Field = (typeof FIELDS)[number];
export const isField = (value: string): value is Field => FIELDS.some(field => field === value);

export const STEP_COUNTS = [4, 6, 8, 12, 16] as const;
export type StepCount = (typeof STEP_COUNTS)[number];
export const isStepCount = (value: number): value is StepCount =>
    STEP_COUNTS.some(count => count === value);

export type Sources = Readonly<Record<SourceParam, string | null>>;

export type Signal = {
    readonly shape: Shape;
    readonly rate: Rate;
    readonly phase: number;
    readonly offset: number;
    readonly depth: number;
    // Kept whatever the shape, so switching away from steps and back finds them as they were.
    readonly steps: readonly number[];
    readonly glide: number;
    readonly sources: Sources;
};

const unsourced: Sources = { phase: null, offset: null, depth: null, time: null };

export const defaultSignal: Signal = {
    shape: 'sine',
    rate: 1,
    phase: 0,
    offset: 0.5,
    depth: 0.5,
    steps: [0.2, 0.9, 0.5, 1, 0.1, 0.7, 0.35, 0.8],
    glide: 0,
    sources: unsourced,
};

export type SignalCommand =
    | { readonly kind: 'shape'; readonly shape: Shape }
    | { readonly kind: 'rate'; readonly rate: Rate }
    | { readonly kind: 'set'; readonly param: Field; readonly value: number }
    // Relative, so a control reports how far it was dragged and never reads the value it moves.
    | { readonly kind: 'nudge'; readonly param: Field; readonly by: number }
    | { readonly kind: 'drag-wave'; readonly dx: number; readonly dy: number }
    | { readonly kind: 'step-count'; readonly count: StepCount }
    // From and to as fractions of the editor, so a fast stroke still sets every step it crossed.
    | { readonly kind: 'draw'; readonly from: Point; readonly to: Point }
    | { readonly kind: 'source'; readonly param: SourceParam; readonly source: string | null };

type Point = { readonly x: number; readonly y: number };

const withParam = (signal: Signal, param: Field, value: number): Signal => {
    if (!Number.isFinite(value)) {
        return signal;
    }

    switch (param) {
        case 'phase':
            return { ...signal, phase: wrap01(value) };
        case 'glide':
            return { ...signal, glide: clamp(value, 0, 1) };
        default:
            return { ...signal, [param]: value };
    }
};

export const resampled = (steps: readonly number[], count: number) =>
    Array.from(
        { length: count },
        (_, index) => steps[Math.floor((index * steps.length) / count)] ?? 0.5,
    );

export const drawn = (steps: readonly number[], from: Point, to: Point) => {
    const indexAt = (x: number) => clamp(Math.floor(x * steps.length), 0, steps.length - 1);
    const [a, b] = from.x <= to.x ? [from, to] : [to, from];
    const first = indexAt(a.x);
    const last = indexAt(b.x);

    return steps.map((value, index) => {
        if (index < first || index > last) {
            return value;
        }

        const along = last === first ? 1 : (index - first) / (last - first);

        return clamp(1 - (a.y + (b.y - a.y) * along), 0, 1);
    });
};

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
        case 'step-count':
            return { ...signal, steps: resampled(signal.steps, command.count) };
        case 'draw':
            return { ...signal, steps: drawn(signal.steps, command.from, command.to) };
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

const eased = (blend: number) => blend * blend * (3 - 2 * blend);

const stepped = (steps: readonly number[], glide: number, at: number) => {
    const position = at * steps.length;
    const index = Math.floor(position) % steps.length;
    const here = steps[index] ?? 0;
    const next = steps[(index + 1) % steps.length] ?? here;
    const into =
        glide <= 0 ? 0 : clamp((position - Math.floor(position) - (1 - glide)) / glide, 0, 1);

    return here + (next - here) * eased(into);
};

const wave = ({ shape, rate, steps, glide }: Signal, cycle: number) => {
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

            return (
                hashed(index) +
                (hashed((index + 1) % count) - hashed(index)) * eased(position - index)
            );
        }
        case 'steps':
            return stepped(steps, glide, at);
    }
};

export const signalAt = (signal: Signal, t: number) =>
    signal.offset + signal.depth * (2 * wave(signal, signal.rate * t + signal.phase) - 1);

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

export const stepAt = ({ signal, mods }: Wave, t: number) =>
    signal.shape !== 'steps'
        ? null
        : Math.floor(
              wrap01(
                  signal.rate * t + (mods.phase === null ? signal.phase : waveAt(mods.phase, t)),
              ) * signal.steps.length,
          ) % signal.steps.length;

// By reference on each signal: the fold makes a new one only when it changed.
export const sameWave = (a: Wave, b: Wave): boolean =>
    a.signal === b.signal &&
    PARAMS.every(param => {
        const x = a.mods[param];
        const y = b.mods[param];

        return x === null || y === null ? x === y : sameWave(x, y);
    });

export type Linked = { readonly sources: Readonly<Record<string, string | null>> };

export const reachedFrom = (
    all: ReadonlyMap<string, Linked>,
    roots: Iterable<string>,
): ReadonlySet<string> => {
    const step = (found: ReadonlySet<string>): ReadonlySet<string> => {
        const next = new Set([
            ...found,
            ...[...found].flatMap(id =>
                Object.values(all.get(id)?.sources ?? {}).flatMap(source =>
                    source === null ? [] : [source],
                ),
            ),
        ]);

        return next.size === found.size ? found : step(next);
    };

    return step(new Set(roots));
};

export const dependentsOf = (
    all: ReadonlyMap<string, Linked>,
    target: string,
): ReadonlySet<string> => {
    const readers = new Map<string, string[]>();

    all.forEach(({ sources }, id) => {
        Object.values(sources).forEach(source => {
            if (source !== null) {
                readers.set(source, [...(readers.get(source) ?? []), id]);
            }
        });
    });

    const step = (found: ReadonlySet<string>): ReadonlySet<string> => {
        const next = new Set([...found, ...[...found].flatMap(id => readers.get(id) ?? [])]);

        return next.size === found.size ? found : step(next);
    };

    return step(new Set([target]));
};

export const closesLoop = (all: ReadonlyMap<string, Linked>, target: string, source: string) =>
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
    const time = field(value, TIME);

    return {
        phase: source('phase'),
        offset: source('offset'),
        depth: source('depth'),
        time: typeof time === 'string' ? time : null,
    };
};

const stepsFrom = (value: unknown) => {
    const steps = Array.isArray(value)
        ? value.flatMap((step: unknown) =>
              typeof step === 'number' && Number.isFinite(step) ? [clamp(step, 0, 1)] : [],
          )
        : [];

    return isStepCount(steps.length) ? steps : defaultSignal.steps;
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
        steps: stepsFrom(field(value, 'steps')),
        glide: clamp(finiteOr(field(value, 'glide'), defaultSignal.glide), 0, 1),
        sources: sourcesFrom(field(value, 'sources')),
    };
};
