import { describe, expect, it } from 'vitest';
import { flight } from './camera.ts';

const viewport = { width: 1400, height: 900 };
const panned = (x: number) => ({ zoom: 1, x: -x, y: 0 });
const durationOver = (distance: number) => flight(panned(0), panned(distance), viewport).duration;

describe('flight duration', () => {
    it('grows with distance', () => {
        const durations = [100, 1400, 8000, 60000].map(durationOver);

        expect([...durations].sort((a, b) => a - b)).toEqual(durations);
    });

    it('gives a short hop time to read, and a long way no more than two seconds', () => {
        expect(durationOver(100)).toBeGreaterThan(800);
        expect(durationOver(60000)).toBeLessThanOrEqual(2000);
    });

    it('compresses the range, so a far jump takes nowhere near its distance in extra time', () => {
        expect(durationOver(60000) / durationOver(100)).toBeLessThan(2.5);
    });
});
