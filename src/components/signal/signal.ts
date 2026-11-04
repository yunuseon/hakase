import { samplesOf, waveAt, type Param, type Wave } from '../../shared/signal.ts';

export const WIDTH = 200;
export const HEIGHT = 80;
const SAMPLES = 240;

export type Plot = {
    readonly path: string;
    readonly min: number;
    readonly max: number;
    readonly zero: number | null;
};

export const plotOf = (wave: Wave): Plot => {
    const samples = samplesOf(wave, SAMPLES);
    const low = Math.min(...samples);
    const high = Math.max(...samples);
    // A flat line gets room around it, or dividing by its span would put it nowhere.
    const [min, max] = high - low < 1e-9 ? [low - 0.5, high + 0.5] : [low, high];
    const yOf = (value: number) => HEIGHT - ((value - min) / (max - min)) * HEIGHT;

    return {
        path: samples
            .map(
                (value, index) =>
                    `${index === 0 ? 'M' : 'L'}${((index / SAMPLES) * WIDTH).toFixed(2)} ${yOf(value).toFixed(2)}`,
            )
            .join(' '),
        min,
        max,
        zero: min < 0 && max > 0 ? yOf(0) : null,
    };
};

export const markerOf = (wave: Wave, { min, max }: Plot, t: number) => ({
    x: t * WIDTH,
    y: HEIGHT - ((waveAt(wave, t) - min) / (max - min)) * HEIGHT,
});

export const valueText = (param: Param, value: number) => {
    if (param === 'phase') {
        return `${Math.round(value * 360)}°`;
    }

    const size = Math.abs(value);

    return size >= 100 ? value.toFixed(0) : size >= 10 ? value.toFixed(1) : value.toFixed(2);
};

export const typedValue = (param: Param, text: string): number | null => {
    const value = Number.parseFloat(text.replace('°', '').replace(',', '.').trim());

    return Number.isFinite(value) ? (param === 'phase' ? value / 360 : value) : null;
};

export const dragStep = (param: Param, fine: boolean) =>
    (param === 'phase' ? 1 / 360 : 0.01) * (fine ? 0.1 : 1);
