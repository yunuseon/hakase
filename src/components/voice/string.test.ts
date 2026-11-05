import { describe, expect, it } from 'vitest';
import { plucked } from './string.ts';

const RATE = 48000;

// The lag, near the expected one, where the signal best matches itself shifted: its period.
const periodOf = (samples: Float32Array, expected: number) => {
    const from = Math.floor(expected * 0.8);
    const to = Math.ceil(expected * 1.2);
    const start = Math.round(RATE * 0.1);
    const span = Math.round(RATE * 0.1);
    const scored = Array.from({ length: to - from + 1 }, (_, index) => {
        const lag = from + index;
        let sum = 0;

        for (let n = start; n < start + span; n += 1) {
            sum += (samples[n] ?? 0) * (samples[n + lag] ?? 0);
        }

        return { lag, sum };
    });
    const best = scored.reduce((top, entry) => (entry.sum > top.sum ? entry : top));
    const before = scored.find(({ lag }) => lag === best.lag - 1)?.sum ?? best.sum;
    const after = scored.find(({ lag }) => lag === best.lag + 1)?.sum ?? best.sum;
    // Between samples: a parabola through the peak and its neighbours finds the fraction.
    const shift = (before - after) / (2 * (before - 2 * best.sum + after) || 1);

    return best.lag + shift;
};

const peakIn = (samples: Float32Array, from: number, to: number) =>
    samples.slice(from, to).reduce((most, value) => Math.max(most, Math.abs(value)), 0);

describe('a plucked string', () => {
    it.each([110, 440, 880])('rings at its pitch, %i Hz, to within a few cents', frequency => {
        const samples = plucked(RATE, frequency, 0.4, { sustain: 3, brightness: 0.7 });
        const heard = RATE / periodOf(samples, RATE / frequency);
        const cents = 1200 * Math.log2(heard / frequency);

        expect(Math.abs(cents)).toBeLessThan(5);
    });

    it('dies away, and sounds the same every time it is struck', () => {
        const tone = { sustain: 3, brightness: 0.7 };
        const samples = plucked(RATE, 220, 2, tone);

        expect(peakIn(samples, 0, RATE / 10)).toBeGreaterThan(0.5);
        expect(peakIn(samples, RATE * 1.8, RATE * 2)).toBeLessThan(
            peakIn(samples, 0, RATE / 10) / 4,
        );
        expect(plucked(RATE, 220, 2, tone)).toEqual(samples);
    });
});
