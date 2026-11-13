export const WIDTH = 200;
export const HEIGHT = 80;

export type Choice = { readonly id: string; readonly title: string };

export type Shape = {
    readonly low: number;
    readonly high: number;
    readonly invert: boolean;
    readonly curve: number;
    readonly steps: number;
    readonly smooth: number;
};

export type ConverterInput = {
    readonly summary: string;
    readonly choices: readonly Choice[];
    readonly choice: string;
    readonly samples: ArrayLike<number> | null;
    readonly value: number | null;
    readonly t: number;
    readonly empty: string;
    readonly shape: Shape | null;
};

export type ShapeView = Shape & {
    readonly curveText: string;
    readonly stepsText: string;
    readonly smoothText: string;
};

export type ConverterView = {
    readonly summary: string;
    readonly choices: readonly (Choice & { readonly checked: boolean })[];
    readonly path: string;
    readonly x: number;
    readonly y: number;
    readonly value: string;
    readonly top: string;
    readonly bottom: string;
    readonly zero: number;
    readonly empty: string | null;
    readonly shape: ShapeView | null;
};

type Bounds = { readonly low: number; readonly high: number };

export const boundsOf = (samples: ArrayLike<number>): Bounds => {
    const values = Array.from(samples);
    const low = Math.min(0, ...values);
    const high = Math.max(1, ...values);

    return { low, high: high > low ? high : low + 1 };
};

const yOf = (value: number, { low, high }: Bounds) =>
    HEIGHT - ((value - low) / (high - low)) * HEIGHT;

export const pathOf = (samples: ArrayLike<number>, bounds: Bounds = boundsOf(samples)): string =>
    Array.from(samples, (value, index) => {
        const x = (index / samples.length) * WIDTH;

        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${yOf(value, bounds).toFixed(1)}`;
    }).join(' ') +
    (samples.length > 0 ? ` L${WIDTH} ${yOf(samples[0] ?? 0, bounds).toFixed(1)}` : '');

const number = (value: number) => String(Math.round(value * 100) / 100);

export const shapeView = (shape: Shape): ShapeView => ({
    ...shape,
    curveText:
        shape.curve === 0
            ? 'linear'
            : `${shape.curve < 0 ? 'out' : 'in'} ${number(Math.abs(shape.curve))}`,
    stepsText: shape.steps < 2 ? 'off' : String(shape.steps),
    smoothText: shape.smooth === 0 ? 'off' : number(shape.smooth),
});

export const converterView = ({
    summary,
    choices,
    choice,
    samples,
    value,
    t,
    empty,
    shape,
}: ConverterInput): ConverterView => {
    const bounds = samples === null ? { low: 0, high: 1 } : boundsOf(samples);

    return {
        summary,
        choices: choices.map(item => ({ ...item, checked: item.id === choice })),
        path: samples === null ? '' : pathOf(samples, bounds),
        x: t * WIDTH,
        y: yOf(value ?? bounds.low, bounds),
        value: value === null ? '–' : value.toFixed(2),
        top: number(bounds.high),
        bottom: number(bounds.low),
        zero: yOf(0, bounds),
        empty: samples === null ? empty : null,
        shape: shape === null ? null : shapeView(shape),
    };
};
