import { describe, expect, it } from 'vitest';
import {
    closesLoop,
    defaultSignal,
    parseSignal,
    RATES,
    reachedFrom,
    reduceSignal,
    SHAPES,
    signalAt,
    waveAt,
    waveOf,
    type Signal,
} from './signal.ts';

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

describe('chains', () => {
    const slow: Signal = { ...defaultSignal, rate: 1, low: 0.2, high: 0.8 };
    const fast: Signal = {
        ...defaultSignal,
        rate: 4,
        sources: { phase: null, low: null, high: 'slow' },
    };
    const all = new Map([
        ['slow', slow],
        ['fast', fast],
    ]);

    it('lets a followed signal stand in for a parameter, at the same moment', () => {
        const chained = waveOf(all, 'fast');

        expect(chained.mods.high?.signal).toBe(slow);
        expect(waveAt(chained, 0.125)).toBeCloseTo(
            signalAt({ ...fast, high: signalAt(slow, 0.125) }, 0.125),
        );
    });

    it('still loops, because what drives it loops too', () => {
        const chained = waveOf(all, 'fast');

        expect(waveAt(chained, 1)).toBeCloseTo(waveAt(chained, 0), 9);
    });

    it('refuses a loop, and stops at one that came in through storage', () => {
        expect(closesLoop(all, 'slow', 'fast')).toBe(true);
        expect(closesLoop(all, 'fast', 'fast')).toBe(true);
        expect(closesLoop(all, 'fast', 'slow')).toBe(false);

        const looped = new Map([
            ['a', { ...defaultSignal, sources: { phase: 'b', low: null, high: null } }],
            ['b', { ...defaultSignal, sources: { phase: 'a', low: null, high: null } }],
        ]);

        expect(waveOf(looped, 'a').mods.phase?.mods.phase).toBeNull();
    });

    it('reaches every store a chain follows, so a prune keeps them', () => {
        expect([...reachedFrom(all, ['fast'])].sort()).toEqual(['fast', 'slow']);
        expect([...reachedFrom(all, ['slow'])]).toEqual(['slow']);
    });

    it('reads sources back from storage, dropping what is not a store id', () => {
        expect(parseSignal({ sources: { high: 'slow', low: 3 } }).sources).toEqual({
            phase: null,
            low: null,
            high: 'slow',
        });
    });
});
