import { describe, expect, it } from 'vitest';
import {
    closesLoop,
    dependentsOf,
    defaultSignal,
    drawn,
    parseSignal,
    RATES,
    reachedFrom,
    reduceSignal,
    resampled,
    SHAPES,
    signalAt,
    stepAt,
    waveAt,
    waveOf,
    type Signal,
} from './signal.ts';
import { curveOf } from './curve.ts';

describe('signalAt', () => {
    it('ends every loop where it began, for every shape and rate', () => {
        for (const shape of SHAPES) {
            for (const rate of RATES) {
                const signal = { ...defaultSignal, shape, rate, phase: 0.3 };

                expect(signalAt(signal, 1)).toBeCloseTo(signalAt(signal, 0), 9);
            }
        }
    });

    it('swings depth either side of offset, however large', () => {
        const signal: Signal = { ...defaultSignal, shape: 'noise', rate: 3, offset: 10, depth: 20 };
        const values = Array.from({ length: 200 }, (_, index) => signalAt(signal, index / 200));

        expect(Math.min(...values)).toBeGreaterThanOrEqual(-10);
        expect(Math.max(...values)).toBeLessThanOrEqual(30);
    });

    it('is a 0 to 1 sine by default, and inverts with a negative depth', () => {
        expect(signalAt(defaultSignal, 0)).toBeCloseTo(0);
        expect(signalAt(defaultSignal, 0.5)).toBeCloseTo(1);
        expect(signalAt({ ...defaultSignal, phase: 0.5 }, 0)).toBeCloseTo(1);
        expect(signalAt({ ...defaultSignal, depth: -0.5 }, 0)).toBeCloseTo(1);
    });
});

describe('steps', () => {
    const steps: Signal = {
        ...defaultSignal,
        shape: 'steps',
        steps: [0, 1, 0.5, 0.25],
        offset: 0.5,
        depth: 0.5,
    };

    it('holds each step for its share of the cycle', () => {
        expect(signalAt(steps, 0.1)).toBeCloseTo(0);
        expect(signalAt(steps, 0.3)).toBeCloseTo(1);
        expect(signalAt(steps, 0.6)).toBeCloseTo(0.5);
        expect(signalAt(steps, 0.99)).toBeCloseTo(0.25);
    });

    it('glides into the next step over the end of each one, the last back into the first', () => {
        const gliding = { ...steps, glide: 0.5 };

        expect(signalAt(gliding, 0.1)).toBeCloseTo(0);
        expect(signalAt(gliding, 0.1875)).toBeCloseTo(0.5);
        expect(signalAt(gliding, 0.2499)).toBeCloseTo(1, 2);
        expect(signalAt(gliding, 1)).toBeCloseTo(signalAt(gliding, 0), 9);
    });

    it('sets every step a stroke crossed, however fast it went', () => {
        expect(
            drawn([0, 0, 0, 0], { x: 0.05, y: 1 }, { x: 0.95, y: 0 }).map(
                value => Math.round(value * 1000) / 1000,
            ),
        ).toEqual([0, 0.333, 0.667, 1]);
        expect(drawn([0, 0, 0, 0], { x: 0.6, y: 0.25 }, { x: 0.6, y: 0.25 })).toEqual([
            0, 0, 0.75, 0,
        ]);
        expect(drawn([0, 0], { x: -1, y: 2 }, { x: -1, y: 2 })).toEqual([0, 0]);
    });

    it('names the step being played, after the phase', () => {
        const wave = waveOf(new Map([['s', steps]]), 's');

        expect(stepAt(wave, 0.1)).toBe(0);
        expect(stepAt(wave, 0.8)).toBe(3);
        expect(stepAt(waveOf(new Map([['s', { ...steps, phase: 0.5 }]]), 's'), 0.1)).toBe(2);
        expect(stepAt(waveOf(new Map([['s', defaultSignal]]), 's'), 0.1)).toBeNull();
    });

    it('keeps the pattern when the count changes', () => {
        expect(resampled([0.1, 0.9], 4)).toEqual([0.1, 0.1, 0.9, 0.9]);
        expect(resampled([0.1, 0.2, 0.3, 0.4], 2)).toEqual([0.1, 0.3]);
        expect(reduceSignal(steps, { kind: 'step-count', count: 8 }).steps).toHaveLength(8);
        expect(reduceSignal(steps, { kind: 'set', param: 'glide', value: 3 }).glide).toBe(1);
    });
});

describe('reduceSignal', () => {
    it('sets and nudges without bounds, wrapping only the phase', () => {
        expect(reduceSignal(defaultSignal, { kind: 'set', param: 'depth', value: 30 }).depth).toBe(
            30,
        );
        expect(reduceSignal(defaultSignal, { kind: 'nudge', param: 'offset', by: -4 }).offset).toBe(
            -3.5,
        );
        expect(
            reduceSignal(defaultSignal, { kind: 'nudge', param: 'phase', by: 1.25 }).phase,
        ).toBeCloseTo(0.25);
        expect(reduceSignal(defaultSignal, { kind: 'set', param: 'depth', value: NaN })).toBe(
            defaultSignal,
        );
    });

    it('moves the offset by the plot and the phase by the cycle when the wave is dragged', () => {
        const dragged = reduceSignal(
            { ...defaultSignal, depth: 2, rate: 4 },
            { kind: 'drag-wave', dx: 0.0625, dy: 0.25 },
        );

        expect(dragged.offset).toBeCloseTo(0.5 - 0.25 * 4);
        expect(dragged.phase).toBeCloseTo(0.75);
    });
});

describe('parseSignal', () => {
    it('falls back field by field, with no bounds on offset and depth', () => {
        expect(parseSignal({ shape: 'saw', rate: 5, phase: 'x', depth: 40 })).toEqual({
            ...defaultSignal,
            shape: 'saw',
            depth: 40,
        });
        expect(parseSignal(null)).toEqual(defaultSignal);
        expect(parseSignal({ steps: [0.5, 2, 'x', 0.1, -1], glide: 0.3 })).toMatchObject({
            steps: [0.5, 1, 0.1, 0],
            glide: 0.3,
        });
        expect(parseSignal({ steps: [0.5, 0.5, 0.5] }).steps).toEqual(defaultSignal.steps);
    });

    it('reads a signal saved as low and high as the same wave', () => {
        const saved = parseSignal({ low: 0.2, high: 0.8, sources: { high: 'slow' } });

        expect(saved.offset).toBeCloseTo(0.5);
        expect(saved.depth).toBeCloseTo(0.3);
        expect(saved.sources).toEqual({ phase: null, offset: null, depth: 'slow', time: null });
    });
});

describe('chains', () => {
    const slow: Signal = { ...defaultSignal, rate: 1, offset: 0.5, depth: 0.3 };
    const fast: Signal = {
        ...defaultSignal,
        rate: 4,
        sources: { phase: null, offset: null, depth: 'slow', time: null },
    };
    const all = new Map([
        ['slow', slow],
        ['fast', fast],
    ]);

    it('takes any level as a parameter, the step curve of a gate included', () => {
        const gate = curveOf(t => (t < 0.5 ? 0 : 1));
        const wave = {
            signal: { ...defaultSignal, shape: 'sine' as const, depth: 1 },
            mods: { phase: null, offset: gate, depth: null },
        };

        expect(waveAt(wave, 0.25)).toBeCloseTo(signalAt({ ...wave.signal, offset: 0 }, 0.25));
        expect(waveAt(wave, 0.75)).toBeCloseTo(signalAt({ ...wave.signal, offset: 1 }, 0.75));
    });

    it('lets a followed signal stand in for a parameter, at the same moment', () => {
        const chained = waveOf(all, 'fast');

        const depth = chained.mods.depth;

        expect(depth !== null && 'signal' in depth ? depth.signal : null).toBe(slow);
        expect(waveAt(chained, 0.125)).toBeCloseTo(
            signalAt({ ...fast, depth: signalAt(slow, 0.125) }, 0.125),
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

        const looped = new Map<string, Signal>([
            [
                'a',
                {
                    ...defaultSignal,
                    sources: { phase: 'b', offset: null, depth: null, time: null },
                },
            ],
            [
                'b',
                {
                    ...defaultSignal,
                    sources: { phase: 'a', offset: null, depth: null, time: null },
                },
            ],
        ]);

        const phase = waveOf(looped, 'a').mods.phase;

        expect(phase !== null && 'mods' in phase ? phase.mods.phase : 'not a wave').toBeNull();
    });

    it('reaches every store a chain follows, so a prune keeps them', () => {
        expect([...reachedFrom(all, ['fast'])].sort()).toEqual(['fast', 'slow']);
        expect([...reachedFrom(all, ['slow'])]).toEqual(['slow']);
    });
});

describe('dependentsOf', () => {
    it('answers exactly what closesLoop answers, for every pair', () => {
        const linked = (sources: Readonly<Record<string, string | null>>) => ({ sources });
        const all = new Map([
            ['a', linked({ in: 'b' })],
            ['b', linked({ in: 'c', other: null })],
            ['c', linked({})],
            ['d', linked({ in: 'a' })],
            ['e', linked({ in: 'e' })],
        ]);
        const ids = ['a', 'b', 'c', 'd', 'e', 'z'];

        ids.forEach(target => {
            const looping = dependentsOf(all, target);

            ids.forEach(source => {
                expect(looping.has(source)).toBe(closesLoop(all, target, source));
            });
        });
    });
});
