import { describe, expect, it } from 'vitest';
import { evolutionsFor, evolutionTo, momentOf, stepAt } from './evolution.ts';

describe('stepAt', () => {
    it('counts whole steps since the start of the loop', () => {
        expect(stepAt(0, 8, 60)).toBe(0);
        expect(stepAt(0.5, 8, 60)).toBe(240);
        expect(stepAt(0.25, 2, 60)).toBe(30);
    });

    it('is the inverse of momentOf on whole steps', () => {
        expect(stepAt(momentOf(123, 8, 60), 8, 60)).toBe(123);
    });
});

describe('evolutionTo', () => {
    it('seeds and replays from nothing, ending on the texture after 1 + target passes', () => {
        expect(evolutionTo(null, 3)).toEqual({
            reset: true,
            from: 0,
            to: 3,
            start: 0,
            end: { step: 3, front: 0 },
        });
        expect(evolutionTo(null, 0).end.front).toBe(1);
    });

    it('steps forward from where it was, flipping once per step', () => {
        expect(evolutionTo({ step: 10, front: 1 }, 13)).toEqual({
            reset: false,
            from: 10,
            to: 13,
            start: 1,
            end: { step: 13, front: 0 },
        });
    });

    it('replays from the start to go back, since steps only run forward', () => {
        expect(evolutionTo({ step: 10, front: 1 }, 4)).toMatchObject({
            reset: true,
            from: 0,
            to: 4,
        });
    });

    it('does nothing on the same step', () => {
        expect(evolutionTo({ step: 7, front: 0 }, 7)).toMatchObject({
            reset: false,
            from: 7,
            to: 7,
            end: { step: 7, front: 0 },
        });
    });
});

describe('evolutionsFor', () => {
    it('chains a run, replaying where the targets go back', () => {
        const run = evolutionsFor([0, 2, 5, 1]);

        expect(run.map(({ reset }) => reset)).toEqual([true, false, false, true]);
        expect(run[2]?.start).toBe(run[1]?.end.front);
    });
});
