import { describe, expect, it } from 'vitest';
import { driverAt } from '../../shared/curve.ts';
import {
    ACCENT,
    beatOf,
    between,
    defaultDrums,
    drumCurve,
    hitsOf,
    kitLevelAt,
    kitOf,
    NORMAL,
    parseDrums,
    PRESETS,
    reduceDrums,
    resampled,
    type Drums,
    type DrumsCommand,
} from './drums.ts';

const run = (
    commands: readonly DrumsCommand[],
    from: Drums = { ...defaultDrums, pattern: resampled(PRESETS['four on the floor'], 16, 16) },
) => commands.reduce(reduceDrums, from);

describe('a drum machine', () => {
    it('cycles a tapped cell off, hit, accent, and paints a stroke with its first cell', () => {
        const cleared = run([{ kind: 'clear' }]);
        const tapped = (count: number) =>
            Array.from({ length: count }, (): DrumsCommand => ({
                kind: 'tap',
                drum: 'snare',
                step: 2,
            }));

        expect(run(tapped(1), cleared).pattern.snare[2]).toBe(NORMAL);
        expect(run(tapped(2), cleared).pattern.snare[2]).toBe(ACCENT);
        expect(run(tapped(3), cleared).pattern.snare[2]).toBe(0);
        expect(
            run(
                [
                    { kind: 'tap', drum: 'hat', step: 0 },
                    { kind: 'paint', drum: 'hat', step: 1, like: { drum: 'hat', step: 0 } },
                    { kind: 'paint', drum: 'hat', step: 2, like: { drum: 'hat', step: 0 } },
                ],
                cleared,
            ).pattern.hat.slice(0, 4),
        ).toEqual([NORMAL, NORMAL, NORMAL, 0]);
    });

    it('fills the cells a quick stroke skipped, along the line it was drawn', () => {
        expect(between({ drum: 'hat', step: 0 }, { drum: 'hat', step: 3 })).toEqual([
            { drum: 'hat', step: 1 },
            { drum: 'hat', step: 2 },
            { drum: 'hat', step: 3 },
        ]);
        expect(between({ drum: 'kick', step: 0 }, { drum: 'clap', step: 2 })).toEqual([
            { drum: 'snare', step: 1 },
            { drum: 'clap', step: 2 },
        ]);
        expect(between({ drum: 'tom', step: 5 }, { drum: 'tom', step: 5 })).toEqual([]);
    });

    it('groups its steps into four beats, in fours or in triplets', () => {
        expect([0, 3, 4, 15].map(step => beatOf(step, 16))).toEqual([0, 0, 1, 3]);
        expect([0, 2, 3, 11].map(step => beatOf(step, 12))).toEqual([0, 0, 1, 3]);
        expect([5, 6, 23].map(step => beatOf(step, 24))).toEqual([0, 1, 3]);
    });

    it('keeps its hits when made finer or coarser', () => {
        const coarse = run([{ kind: 'steps', steps: 8 }]);
        const fine = run([{ kind: 'steps', steps: 32 }]);

        expect(coarse.pattern.kick).toEqual([ACCENT, 0, ACCENT, 0, ACCENT, 0, ACCENT, 0]);
        expect(fine.pattern.kick.filter(velocity => velocity > 0)).toHaveLength(4);
        expect(fine.pattern.kick[8]).toBe(ACCENT);
    });

    it('places each hit in the loop, swung and repeated', () => {
        const swung = run([
            { kind: 'clear' },
            { kind: 'tap', drum: 'hat', step: 1 },
            { kind: 'swing', swing: 0.5 },
        ]);
        const twice = run([{ kind: 'repeat', repeat: 2 }], swung);

        expect(hitsOf(swung).map(({ from }) => from)).toEqual([1.5 / 16]);
        expect(hitsOf(twice).map(({ from }) => from)).toEqual([1.5 / 32, 0.5 + 1.5 / 32]);
    });

    it('offers a sketch its level, flaring on each hit and falling away, across the loop too', () => {
        const kick = run([
            { kind: 'clear' },
            { kind: 'tap', drum: 'kick', step: 0 },
            { kind: 'tap', drum: 'kick', step: 0 },
        ]);
        const kit = kitOf(kick, new Map());
        const hits = hitsOf(kick);

        expect(kitLevelAt(kit, hits, 0, 8)).toBeCloseTo(kick.volume);
        expect(kitLevelAt(kit, hits, 0.02, 8)).toBeLessThan(kitLevelAt(kit, hits, 0.005, 8));
        expect(kitLevelAt(kit, hits, 0.999, 1)).toBeLessThan(0.01);
    });

    it('offers one drum on its own, at its own velocity, and nothing for a drum it lacks', () => {
        const pair = run([
            { kind: 'clear' },
            { kind: 'tap', drum: 'kick', step: 0 },
            { kind: 'tap', drum: 'hat', step: 8 },
        ]);
        const kit = kitOf(pair, new Map());
        const hat = drumCurve(kit, 'hat', 8);

        expect(driverAt(hat, 0.5)).toBeCloseTo(pair.volume * NORMAL);
        expect(driverAt(hat, 0.52)).toBeLessThan(driverAt(hat, 0.505));
        expect(driverAt(hat, 0.01)).toBe(0);
        expect(driverAt(drumCurve(kit, 'kick', 8), 0)).toBeCloseTo(pair.volume * NORMAL);
        expect(driverAt(drumCurve(kit, 'tom', 8), 0.3)).toBe(0);
    });

    it('reads a broken save as the default, field by field', () => {
        expect(parseDrums({ steps: 8, swing: 3, pattern: { kick: [1, 'x', 0.5] } })).toMatchObject({
            steps: 8,
            swing: 0.5,
            pattern: { kick: [1, 0, 0.5, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0] },
        });
        expect(parseDrums(null)).toBe(defaultDrums);
    });
});
