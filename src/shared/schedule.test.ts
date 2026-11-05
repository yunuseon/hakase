import { describe, expect, it } from 'vitest';
import { scheduled, unscheduled, type Frame, type Schedule, type Strike } from './schedule.ts';
import type { Note } from '../components/voice/voice.ts';

const quarters: readonly Note[] = [0, 0.25, 0.5, 0.75].map((from, index) => ({
    from,
    to: from + 0.25,
    semitones: index * 2,
    carried: false,
}));

const frame = (t: number, now: number, playing = true): Frame => ({ t, now, seconds: 8, playing });

const run = (frames: readonly Frame[], notes: readonly Note[] = quarters) =>
    frames.reduce<{ schedule: Schedule; strikes: readonly Strike<Note>[] }>(
        ({ schedule, strikes }, next) => {
            const made = scheduled(schedule, next, notes);

            return { schedule: made.schedule, strikes: [...strikes, ...made.strikes] };
        },
        { schedule: unscheduled, strikes: [] },
    );

describe('the note scheduler', () => {
    it('strikes each note once, ahead of the playhead, at its exact time on the audio clock', () => {
        const frames = Array.from({ length: 60 }, (_, index) =>
            frame(0.2 + index / 480, 100 + index / 60),
        );
        const { strikes } = run(frames);

        expect(strikes.map(({ span }) => span.semitones)).toEqual([2]);
        expect(strikes[0]?.at).toBeCloseTo(100 + (0.25 - 0.2) * 8);
        expect(strikes[0]?.held).toBeCloseTo(2);
    });

    it('carries on through the loop wrapping, striking the first note of the next loop', () => {
        const { strikes } = run([frame(0.97, 10), frame(0.99, 10.16), frame(0.005, 10.28)]);

        expect(strikes.map(({ span }) => span.semitones)).toEqual([0]);
        expect(strikes[0]?.at).toBeCloseTo(10 + 0.03 * 8);
    });

    it('starts afresh after a scrub, and plays nothing while paused', () => {
        expect(
            run([frame(0.1, 0), frame(0.6, 0.02)]).strikes.map(({ span }) => span.semitones),
        ).toEqual([]);
        expect(
            run([frame(0.1, 0), frame(0.749, 0.02)]).strikes.map(({ span }) => span.semitones),
        ).toEqual([6]);
        expect(run([frame(0.24, 0, false), frame(0.25, 0.1, false)]).strikes).toEqual([]);
    });

    it('never strikes a note that only carries on across the loop', () => {
        const carried: readonly Note[] = [
            { from: 0, to: 0.5, semitones: 0, carried: true },
            { from: 0.5, to: 1, semitones: 0, carried: false },
        ];

        expect(run([frame(0.99, 0), frame(0.999, 0.05)], carried).strikes).toEqual([]);
        expect(run([frame(0.49, 0)], carried).strikes.map(({ held }) => held)).toEqual([8]);
    });

    it('keeps every strike on the grid though each frame reads the audio clock a little late', () => {
        const frames = Array.from({ length: 240 }, (_, index) =>
            frame(((index / 240) % 1) + 0.001, 50 + (index / 240) * 8 + ((index * 7) % 5) * 0.003),
        );
        const { strikes } = run(frames);

        const offGrid = strikes.map(({ at }) => {
            const steps = (at - (50 - 0.001 * 8)) / 2;

            return Math.abs(steps - Math.round(steps)) * 2;
        });

        expect(Math.max(...offGrid)).toBeLessThan(1e-9);
        expect(strikes.map(({ span }) => span.semitones)).toEqual([2, 4, 6, 0]);
    });
});
