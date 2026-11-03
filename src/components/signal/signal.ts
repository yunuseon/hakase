import { samplesOf, signalAt, type Signal } from '../../shared/signal.ts';

export const WIDTH = 200;
export const HEIGHT = 80;
const SAMPLES = 240;

const yOf = (value: number) => HEIGHT - value * HEIGHT;

export const pathOf = (signal: Signal) =>
    samplesOf(signal, SAMPLES)
        .map(
            (value, index) =>
                `${index === 0 ? 'M' : 'L'}${((index / SAMPLES) * WIDTH).toFixed(2)} ${yOf(value).toFixed(2)}`,
        )
        .join(' ');

export const markerOf = (signal: Signal, t: number) => ({
    x: t * WIDTH,
    y: yOf(signalAt(signal, t)),
});
