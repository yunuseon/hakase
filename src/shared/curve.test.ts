import { describe, expect, it } from 'vitest';
import { CURVE_SAMPLES, curveAt, curveOf, driverAt } from './curve.ts';
import { defaultSignal, waveOf } from './signal.ts';

describe('a curve', () => {
    it('reads between its samples and eases its last back into its first, so it loops', () => {
        const ramp = curveOf(t => t);

        expect(curveAt(ramp, 0.5)).toBeCloseTo(0.5);
        expect(curveAt(ramp, 0.25 / CURVE_SAMPLES)).toBeCloseTo(0.25 / CURVE_SAMPLES);
        expect(curveAt(ramp, 1 - 0.5 / CURVE_SAMPLES)).toBeCloseTo((1 - 1 / CURVE_SAMPLES) * 0.5);
        expect(curveAt(ramp, 1.5)).toBeCloseTo(0.5);
    });

    it('drives like a signal', () => {
        const wave = waveOf(new Map([['a', defaultSignal]]), 'a');
        const ramp = curveOf(t => t);

        expect(driverAt(ramp, 0.25)).toBeCloseTo(0.25);
        expect(driverAt(wave, 0)).toBeCloseTo(0);
    });
});
