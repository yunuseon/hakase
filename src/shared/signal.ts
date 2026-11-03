import { clamp } from '../lib/math.ts';

export const SHAPES = ['sine', 'triangle', 'saw', 'square', 'noise'] as const;
export type Shape = (typeof SHAPES)[number];
export const isShape = (value: string): value is Shape => SHAPES.some(shape => shape === value);

// Whole numbers only: a signal that runs a whole number of cycles per loop ends where it began.
export const RATES = [1, 2, 3, 4, 6, 8, 16] as const;
export type Rate = (typeof RATES)[number];
export const isRate = (value: number): value is Rate => RATES.some(rate => rate === value);

export type Signal = {
    readonly shape: Shape;
    readonly rate: Rate;
    readonly phase: number;
    readonly low: number;
    readonly high: number;
};

export const defaultSignal: Signal = { shape: 'sine', rate: 1, phase: 0, low: 0, high: 1 };

export type SignalCommand =
    | { readonly kind: 'shape'; readonly shape: Shape }
    | { readonly kind: 'rate'; readonly rate: Rate }
    | { readonly kind: 'phase'; readonly phase: number }
    | { readonly kind: 'low'; readonly low: number }
    | { readonly kind: 'high'; readonly high: number };

export const reduceSignal = (signal: Signal, command: SignalCommand) => {
    switch (command.kind) {
        case 'shape':
            return { ...signal, shape: command.shape };
        case 'rate':
            return { ...signal, rate: command.rate };
        case 'phase':
            return { ...signal, phase: clamp(command.phase, 0, 1) };
        case 'low':
            return { ...signal, low: clamp(command.low, 0, 1) };
        case 'high':
            return { ...signal, high: clamp(command.high, 0, 1) };
    }
};

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

export const signalAt = ({ shape, rate, phase, low, high }: Signal, t: number) =>
    low + (high - low) * wave(shape, rate, rate * t + phase);

export const samplesOf = (signal: Signal, count: number) =>
    Array.from({ length: count + 1 }, (_, index) => signalAt(signal, index / count));

const unit = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 1) : fallback;

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

export const parseSignal = (value: unknown): Signal => {
    if (typeof value !== 'object' || value === null) {
        return defaultSignal;
    }

    const shape = field(value, 'shape');
    const rate = field(value, 'rate');

    return {
        shape: typeof shape === 'string' && isShape(shape) ? shape : defaultSignal.shape,
        rate: typeof rate === 'number' && isRate(rate) ? rate : defaultSignal.rate,
        phase: unit(field(value, 'phase'), defaultSignal.phase),
        low: unit(field(value, 'low'), defaultSignal.low),
        high: unit(field(value, 'high'), defaultSignal.high),
    };
};
