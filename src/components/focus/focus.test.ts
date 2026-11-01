import { describe, expect, it } from 'vitest';
import {
    clockOf,
    initialFocus,
    parseFocus,
    reduceFocus,
    ROUNDS,
    type Focus,
    type FocusCommand,
} from './focus.ts';

const command = (focus: Focus, value: FocusCommand): Focus =>
    reduceFocus(focus, { kind: 'command', command: value });

const tick = (focus: Focus, ms: number): Focus => reduceFocus(focus, { kind: 'tick', ms });

const running = command(initialFocus, { kind: 'toggle' });

describe('reduceFocus', () => {
    it('counts down only while running', () => {
        expect(tick(initialFocus, 1000)).toBe(initialFocus);
        expect(tick(running, 1000).remaining).toBe(initialFocus.remaining - 1000);
    });

    it('pauses on a break when work runs out, and counts it as completed', () => {
        const done = tick(running, initialFocus.remaining);

        expect(done).toMatchObject({ phase: 'short', round: 1, running: false, completed: 1 });
        expect(done.remaining).toBe(5 * 60_000);
    });

    it('takes the long break after every fourth session', () => {
        const fourth = Array.from({ length: ROUNDS * 2 - 1 }).reduce<Focus>(
            focus => command(focus, { kind: 'skip' }),
            initialFocus,
        );

        expect(fourth).toMatchObject({ phase: 'long', round: ROUNDS });
        expect(command(fourth, { kind: 'skip' })).toMatchObject({ phase: 'work', round: 0 });
    });

    it('does not count a skip as completed', () => {
        expect(command(running, { kind: 'skip' }).completed).toBe(0);
    });

    it('applies a new length to a phase that has not started', () => {
        const longer = command(initialFocus, { kind: 'length', phase: 'work', minutes: 50 });
        const started = command(tick(running, 1000), {
            kind: 'length',
            phase: 'work',
            minutes: 50,
        });

        expect(longer.remaining).toBe(50 * 60_000);
        expect(started.remaining).toBe(initialFocus.remaining - 1000);
        expect(
            command(initialFocus, { kind: 'length', phase: 'short', minutes: 0 }).lengths.short,
        ).toBe(1);
    });

    it('resets to the first session but keeps the lengths', () => {
        const longer = command(tick(running, 5000), { kind: 'length', phase: 'work', minutes: 40 });
        const reset = command(longer, { kind: 'reset' });

        expect(reset).toMatchObject({
            phase: 'work',
            round: 0,
            running: false,
            remaining: 40 * 60_000,
        });
    });
});

describe('clockOf', () => {
    it('rounds up to the whole second still to go', () => {
        expect(clockOf(25 * 60_000)).toBe('25:00');
        expect(clockOf(59_001)).toBe('01:00');
        expect(clockOf(-5)).toBe('00:00');
    });
});

describe('parseFocus', () => {
    it('never restores a running clock and clamps what it reads', () => {
        const focus = parseFocus({
            phase: 'short',
            round: 9,
            remaining: 10 ** 9,
            running: true,
            lengths: { work: 30, short: 'x', long: 999 },
        });

        expect(focus).toMatchObject({ phase: 'short', round: ROUNDS, running: false });
        expect(focus.lengths).toEqual({ work: 30, short: 5, long: 180 });
        expect(focus.remaining).toBe(5 * 60_000);
    });
});
