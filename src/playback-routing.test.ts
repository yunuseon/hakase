import { describe, expect, it } from 'vitest';
import { emptyRouting, reduceRouting, type Routing } from './playback-routing.ts';
import type { AppInput } from './program.ts';
import type { PlaybackBinding } from './inputs.ts';

const playback: PlaybackBinding = { kind: 'playback', store: 'movie' };
const input = (
    state: Routing,
    from: string,
    clock: PlaybackBinding | null,
    value: AppInput,
): Routing => reduceRouting(state, { kind: 'input', value: { from, clock, input: value } });
const grab = (state: Routing, from = 'dial'): Routing =>
    input(state, from, playback, { kind: 'scrub', phase: 'grab', at: 0.4 });
const release = { store: 'movie', command: { kind: 'scrub', scrub: { phase: 'release', at: 0 } } };

describe('playback routing', () => {
    it('has no write destination for focus progress', () => {
        expect(
            input(emptyRouting, 'dial', null, { kind: 'scrub', phase: 'grab', at: 0.5 }).commands,
        ).toEqual([]);
        expect(
            input(emptyRouting, 'dial', null, { kind: 'transport', command: 'toggle' }).commands,
        ).toEqual([]);
    });

    it('routes commands to the selected playback store', () => {
        expect(
            input(emptyRouting, 'timeline', playback, { kind: 'duration', seconds: 12 }).commands,
        ).toEqual([{ store: 'movie', command: { kind: 'duration', seconds: 12 } }]);
        expect(input(emptyRouting, 'timeline', playback, { kind: 'day' }).commands).toEqual([
            { store: 'movie', command: { kind: 'day' } },
        ]);
        expect(grab(emptyRouting).commands).toEqual([
            { store: 'movie', command: { kind: 'scrub', scrub: { phase: 'grab', at: 0.4 } } },
        ]);
    });

    it('releases the old clock when a dial switches to focus, another clock, or closes', () => {
        for (const targets of [
            [],
            [{ id: 'dial', clock: null }],
            [{ id: 'dial', clock: { kind: 'playback' as const, store: 'other' } }],
        ]) {
            expect(
                reduceRouting(grab(emptyRouting), { kind: 'targets', targets }).commands,
            ).toEqual([release]);
        }
    });

    it('does not release a clock still held by another window', () => {
        const two = grab(grab(emptyRouting), 'sketch');
        const one = input(two, 'dial', playback, { kind: 'scrub', phase: 'release', at: 1 });
        expect(one.commands).toEqual([]);
        expect(
            input(one, 'sketch', playback, { kind: 'scrub', phase: 'release', at: 1 }).commands,
        ).toEqual([release]);
    });

    it('ignores an orphan release and unrelated workspace changes', () => {
        expect(
            input(emptyRouting, 'dial', playback, { kind: 'scrub', phase: 'release', at: 1 })
                .commands,
        ).toEqual([]);
        expect(
            reduceRouting(grab(emptyRouting), {
                kind: 'targets',
                targets: [{ id: 'dial', clock: playback }],
            }).commands,
        ).toEqual([]);
    });
});
