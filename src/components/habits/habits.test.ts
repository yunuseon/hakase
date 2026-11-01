import { describe, expect, it } from 'vitest';
import {
    daysUpTo,
    emptyHabits,
    parseHabits,
    reduceHabits,
    streakOf,
    type HabitCommand,
    type Habits,
} from './habits.ts';

const run = (...commands: HabitCommand[]): Habits => commands.reduce(reduceHabits, emptyHabits);

describe('reduceHabits', () => {
    it('adds named habits and toggles days on and off, kept in order', () => {
        const habits = run(
            { kind: 'add', name: ' Read ' },
            { kind: 'add', name: ' ' },
            { kind: 'toggle', id: 'habit-1', day: '2026-11-02' },
            { kind: 'toggle', id: 'habit-1', day: '2026-11-01' },
            { kind: 'toggle', id: 'habit-1', day: '2026-11-02' },
            { kind: 'toggle', id: 'habit-1', day: '2026-10-31' },
        );

        expect(habits.items).toEqual([
            { id: 'habit-1', name: 'Read', done: ['2026-10-31', '2026-11-01'] },
        ]);
    });

    it('keeps the name when a rename is emptied', () => {
        const habits = run(
            { kind: 'add', name: 'Run' },
            { kind: 'rename', id: 'habit-1', name: '' },
        );

        expect(habits.items[0]?.name).toBe('Run');
    });
});

describe('streakOf', () => {
    const done = ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];

    it('counts back from today, or from yesterday while today is still open', () => {
        expect(streakOf(done, '2026-11-01')).toBe(4);
        expect(streakOf(done, '2026-11-02')).toBe(4);
        expect(streakOf(done, '2026-11-03')).toBe(0);
        expect(streakOf([], '2026-11-01')).toBe(0);
    });
});

describe('daysUpTo', () => {
    it('ends on today', () => {
        expect(daysUpTo('2026-11-02', 3)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    });
});

describe('parseHabits', () => {
    it('keeps only real days, once each, in order', () => {
        const habits = parseHabits({
            items: [
                {
                    id: 'habit-3',
                    name: 'x',
                    done: ['2026-11-02', 'nope', '2026-11-01', '2026-11-02', 4],
                },
            ],
            made: 0,
        });

        expect(habits).toEqual({
            items: [{ id: 'habit-3', name: 'x', done: ['2026-11-01', '2026-11-02'] }],
            made: 3,
        });
    });
});
