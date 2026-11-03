import { describe, expect, it } from 'vitest';
import { defaultSignal, parseSignal, reduceSignal, SHAPES, signalAt, RATES } from './signal.ts';

describe('signalAt', () => {
    it('ends every loop where it began, for every shape and rate', () => {
        for (const shape of SHAPES) {
            for (const rate of RATES) {
                const signal = { ...defaultSignal, shape, rate, phase: 0.3 };

                expect(signalAt(signal, 1)).toBeCloseTo(signalAt(signal, 0), 9);
            }
        }
    });

    it('stays within its range', () => {
        const signal = {
            ...defaultSignal,
            shape: 'noise' as const,
            rate: 3 as const,
            low: 0.2,
            high: 0.6,
        };
        const values = Array.from({ length: 200 }, (_, index) => signalAt(signal, index / 200));

        expect(Math.min(...values)).toBeGreaterThanOrEqual(0.2);
        expect(Math.max(...values)).toBeLessThanOrEqual(0.6);
    });

    it('runs a sine from low through high and back', () => {
        expect(signalAt(defaultSignal, 0)).toBeCloseTo(0);
        expect(signalAt(defaultSignal, 0.5)).toBeCloseTo(1);
        expect(signalAt({ ...defaultSignal, phase: 0.5 }, 0)).toBeCloseTo(1);
    });

    it('inverts when low is above high', () => {
        expect(signalAt({ ...defaultSignal, low: 1, high: 0 }, 0)).toBeCloseTo(1);
    });
});

describe('reduceSignal', () => {
    it('clamps what it is given', () => {
        expect(reduceSignal(defaultSignal, { kind: 'phase', phase: 3 }).phase).toBe(1);
        expect(reduceSignal(defaultSignal, { kind: 'low', low: -1 }).low).toBe(0);
    });
});

describe('parseSignal', () => {
    it('falls back field by field', () => {
        expect(parseSignal({ shape: 'saw', rate: 5, phase: 'x', high: 0.4 })).toEqual({
            ...defaultSignal,
            shape: 'saw',
            high: 0.4,
        });
        expect(parseSignal(null)).toEqual(defaultSignal);
    });
});
