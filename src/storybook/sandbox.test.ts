import { describe, expect, it } from 'vitest';
import { reduceSandbox, sandboxSeed } from './sandbox.ts';

describe('storybook sandbox', () => {
    it('keeps edits within one fixture, and starts each mount fresh', () => {
        const first = sandboxSeed(undefined);
        const changed = reduceSandbox(first, {
            kind: 'ticket',
            command: { kind: 'add', status: null, parent: null, title: 'Only in this example' },
        });
        expect(changed.tickets.numbered).toBe(first.tickets.numbered + 1);
        expect(sandboxSeed(undefined).tickets).toEqual(first.tickets);
        expect(changed.settings).toBe(first.settings);
    });
    it('never applies workspace navigation, history or wiring requests', () => {
        const state = sandboxSeed(undefined);
        expect(reduceSandbox(state, { kind: 'close-others' })).toBe(state);
        expect(reduceSandbox(state, { kind: 'travel', offset: -1 })).toBe(state);
        expect(
            reduceSandbox(state, {
                kind: 'wiring',
                command: { kind: 'bind', window: 'actual-window', store: 'actual-store' },
            }),
        ).toBe(state);
    });
    it('advances playback and focus only in the sandbox', () => {
        const state = sandboxSeed(undefined);
        const playing = reduceSandbox(state, { kind: 'transport', command: 'toggle' });
        const focused = reduceSandbox(playing, { kind: 'focus', command: { kind: 'toggle' } });
        const after = reduceSandbox(focused, { kind: 'advance', ms: 1000 });
        expect(after.clock.at).toBe(0.125);
        expect(after.focus.remaining).toBe(state.focus.remaining - 1000);
        expect(state.clock.at).toBe(0);
    });
});
