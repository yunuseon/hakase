import { section, type Section } from '../../shared/properties.ts';

export const WIDTH = 200;
export const HEIGHT = 80;

export type Choice = { readonly id: string; readonly title: string };

export type Shape = {
    readonly low: number;
    readonly high: number;
    readonly fit: boolean;
    readonly invert: boolean;
    readonly curve: number;
    readonly steps: number;
    readonly smooth: number;
    readonly grid: number;
};

export type Bits = {
    readonly invert: boolean;
    readonly hold: number;
    readonly threshold: number;
    readonly band: number;
};

export type ConverterInput = {
    readonly summary: string;
    readonly samples: ArrayLike<number> | null;
    readonly value: number | null;
    readonly t: number;
    readonly empty: string;
};

export type ConverterView = {
    readonly summary: string;
    readonly path: string;
    readonly x: number;
    readonly y: number;
    readonly value: string;
    readonly top: string;
    readonly bottom: string;
    readonly zero: number;
    readonly empty: string | null;
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

export const converterView = ({
    summary,
    samples,
    value,
    t,
    empty,
}: ConverterInput): ConverterView => {
    const bounds = samples === null ? { low: 0, high: 1 } : boundsOf(samples);

    return {
        summary,
        path: samples === null ? '' : pathOf(samples, bounds),
        x: t * WIDTH,
        y: yOf(value ?? bounds.low, bounds),
        value: value === null ? '–' : value.toFixed(2),
        top: number(bounds.high),
        bottom: number(bounds.low),
        zero: yOf(0, bounds),
        empty: samples === null ? empty : null,
    };
};

export type ConverterControls = {
    readonly choices: readonly Choice[];
    readonly choice: string;
    readonly items: readonly Choice[];
    readonly item: string;
    readonly shape: Shape | null;
    readonly bits: Bits | null;
    readonly thresholded: boolean;
};

const shapeSection = (shape: Shape): Section =>
    section('shape', 'Shape', [
        {
            kind: 'span',
            id: 'shape.range',
            label: 'range',
            low: { id: 'shape.low', label: 'lowest value', value: shape.low },
            high: { id: 'shape.high', label: 'highest value', value: shape.high },
            step: 0.1,
        },
        {
            kind: 'toggle',
            id: 'shape.fit',
            label: 'fit',
            value: shape.fit,
            hint: 'stretch what it reads to fill the range',
        },
        { kind: 'toggle', id: 'shape.invert', label: 'invert', value: shape.invert },
        {
            kind: 'range',
            id: 'shape.curve',
            label: 'curve',
            value: shape.curve,
            min: -1,
            max: 1,
            step: 0.05,
            text:
                shape.curve === 0
                    ? 'linear'
                    : `${shape.curve < 0 ? 'out' : 'in'} ${number(Math.abs(shape.curve))}`,
        },
        {
            kind: 'range',
            id: 'shape.steps',
            label: 'steps',
            value: shape.steps,
            min: 0,
            max: 16,
            step: 1,
            text: shape.steps < 2 ? 'off' : String(shape.steps),
        },
        {
            kind: 'range',
            id: 'shape.smooth',
            label: 'smooth',
            value: shape.smooth,
            min: 0,
            max: 0.99,
            step: 0.01,
            text: shape.smooth === 0 ? 'off' : number(shape.smooth),
        },
        {
            kind: 'range',
            id: 'shape.grid',
            label: 'grid',
            value: shape.grid,
            min: 0,
            max: 64,
            step: 1,
            text: shape.grid === 0 ? 'off' : `${shape.grid} a loop`,
            hint: 'sample and hold, this many times a loop',
        },
    ]);

const bitsSection = (bits: Bits, thresholded: boolean): Section =>
    section('bits', 'Bit', [
        ...(thresholded
            ? [
                  {
                      kind: 'number' as const,
                      id: 'bits.threshold',
                      label: 'threshold',
                      value: bits.threshold,
                      step: 0.1,
                  },
                  {
                      kind: 'number' as const,
                      id: 'bits.band',
                      label: 'band',
                      value: bits.band,
                      step: 0.1,
                      hint: 'hysteresis: how far past the threshold it must go to flip back',
                  },
              ]
            : []),
        { kind: 'toggle', id: 'bits.invert', label: 'invert', value: bits.invert },
        {
            kind: 'range',
            id: 'bits.hold',
            label: 'hold',
            value: bits.hold,
            min: 0,
            max: 0.5,
            step: 0.01,
            text: bits.hold === 0 ? 'off' : `${Math.round(bits.hold * 100)}%`,
        },
    ]);

const optionsOf = (choices: readonly Choice[]) =>
    choices.map(({ id, title }) => ({ value: id, label: title }));

export const converterSections = ({
    choices,
    choice,
    items,
    item,
    shape,
    bits,
    thresholded,
}: ConverterControls): readonly Section[] => [
    section(
        'reading',
        null,
        [
            ...(items.length === 0
                ? []
                : [
                      {
                          kind: 'choice' as const,
                          id: 'item',
                          label: 'of',
                          value: item,
                          options: optionsOf(items),
                      },
                  ]),
            {
                kind: 'choice',
                id: 'reading',
                label: 'reads',
                value: choice,
                options: optionsOf(choices),
            },
        ],
        false,
    ),
    ...(shape === null ? [] : [shapeSection(shape)]),
    ...(bits === null ? [] : [bitsSection(bits, thresholded)]),
];
