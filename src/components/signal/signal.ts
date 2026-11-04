import { samplesOf, waveAt, type Wave } from '../../shared/signal.ts';

export const WIDTH = 200;
export const HEIGHT = 80;
const SAMPLES = 240;

const yOf = (value: number) => HEIGHT - value * HEIGHT;

export const pathOf = (wave: Wave) =>
    samplesOf(wave, SAMPLES)
        .map(
            (value, index) =>
                `${index === 0 ? 'M' : 'L'}${((index / SAMPLES) * WIDTH).toFixed(2)} ${yOf(value).toFixed(2)}`,
        )
        .join(' ');

export const markerOf = (wave: Wave, t: number) => ({
    x: t * WIDTH,
    y: yOf(waveAt(wave, t)),
});
