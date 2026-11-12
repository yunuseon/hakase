import { clamp } from '../../lib/math.ts';

export const WIDTH = 200;
export const HEIGHT = 80;

export type Choice = { readonly id: string; readonly title: string };

export type ConverterInput = {
    readonly summary: string;
    readonly choices: readonly Choice[];
    readonly choice: string;
    readonly samples: ArrayLike<number> | null;
    readonly value: number | null;
    readonly t: number;
    readonly empty: string;
};

export type ConverterView = {
    readonly summary: string;
    readonly choices: readonly (Choice & { readonly checked: boolean })[];
    readonly path: string;
    readonly x: number;
    readonly y: number;
    readonly value: string;
    readonly empty: string | null;
};

const yOf = (value: number) => HEIGHT - clamp(value, 0, 1) * HEIGHT;

export const pathOf = (samples: ArrayLike<number>): string =>
    Array.from(samples, (value, index) => {
        const x = (index / samples.length) * WIDTH;

        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${yOf(value).toFixed(1)}`;
    }).join(' ') + (samples.length > 0 ? ` L${WIDTH} ${yOf(samples[0] ?? 0).toFixed(1)}` : '');

export const converterView = ({
    summary,
    choices,
    choice,
    samples,
    value,
    t,
    empty,
}: ConverterInput): ConverterView => ({
    summary,
    choices: choices.map(item => ({ ...item, checked: item.id === choice })),
    path: samples === null ? '' : pathOf(samples),
    x: t * WIDTH,
    y: yOf(value ?? 0),
    value: value === null ? '–' : value.toFixed(2),
    empty: samples === null ? empty : null,
});
