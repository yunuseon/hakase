import { waveAt, type Wave } from './signal.ts';

export type Curve = { readonly samples: Float32Array };

export type Driver = Wave | Curve;

const isCurve = (driver: Driver): driver is Curve => 'samples' in driver;

export const CURVE_SAMPLES = 960;

export const curveOf = (at: (t: number) => number): Curve => ({
    samples: Float32Array.from({ length: CURVE_SAMPLES }, (_, index) => at(index / CURVE_SAMPLES)),
});

// Read between samples, the last easing back into the first, so a curve loops like a signal does.
export const curveAt = ({ samples }: Curve, t: number) => {
    const position = (((t % 1) + 1) % 1) * samples.length;
    const index = Math.floor(position);
    const here = samples[index % samples.length] ?? 0;
    const next = samples[(index + 1) % samples.length] ?? here;

    return here + (next - here) * (position - index);
};

export const driverAt = (driver: Driver, t: number) =>
    isCurve(driver) ? curveAt(driver, t) : waveAt(driver, t);
