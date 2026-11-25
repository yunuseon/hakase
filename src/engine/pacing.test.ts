import { describe, expect, it } from 'vitest';
import {
    LATE_MS,
    MAX_STEP,
    paced,
    passesTo,
    partsOf,
    SLOTS,
    startPace,
    type Pass,
} from './pacing.ts';

const pixelsDone = (passes: readonly Pass[], phase: number) =>
    passes.reduce(
        (done, pass) =>
            done +
            (pass.slots === 1 || (phase >= pass.phase && phase < pass.phase + pass.count)
                ? pass.batch
                : 0),
        0,
    );

describe('passes', () => {
    it('trace whole samples as full passes, at most a batch a draw', () => {
        expect(passesTo(0, partsOf(5), 2)).toEqual([
            { slots: 1, phase: 0, count: 1, batch: 2 },
            { slots: 1, phase: 0, count: 1, batch: 2 },
            { slots: 1, phase: 0, count: 1, batch: 1 },
        ]);
    });

    it('trace a part of a sample one band at a time, each band the same however the work is split', () => {
        const target = 2 * SLOTS + 5;
        const once = passesTo(0, target, 16);
        const split = [
            ...passesTo(0, 3, 16),
            ...passesTo(3, SLOTS + 1, 16),
            ...passesTo(SLOTS + 1, target, 16),
        ];
        const phases = Array.from({ length: SLOTS }, (_, phase) => phase);

        expect(phases.map(phase => pixelsDone(split, phase))).toEqual(
            phases.map(phase => pixelsDone(once, phase)),
        );
        expect(phases.map(phase => pixelsDone(once, phase))).toEqual(
            phases.map(phase => (phase < 5 ? 3 : 2)),
        );
        expect(passesTo(7, 7, 16)).toEqual([]);
        expect(passesTo(3, 9, 16)).toEqual([{ slots: SLOTS, phase: 3, count: 6, batch: 1 }]);
    });
});

describe('pacing', () => {
    it('grows the work while frames keep time, halves it when one is late, and stops at the cap', () => {
        const first = paced(startPace(0), 0, 64);
        const onTime = paced(first, 16.7, 64);
        const late = paced(onTime, 16.7 + LATE_MS + 10, 64);

        expect(first.parts).toBe(SLOTS / 4);
        expect(onTime.step).toBeGreaterThan(first.step);
        expect(late.step).toBe(Math.floor(onTime.step / 2));
        expect(paced({ parts: partsOf(64) - 3, step: MAX_STEP, last: 0 }, 16, 64).parts).toBe(
            partsOf(64),
        );
        expect(paced({ parts: 0, step: 1, last: 0 }, 100, 64).step).toBe(1);
    });
});
