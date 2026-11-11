import { describe, expect, it } from 'vitest';
import {
    DEFAULT_TICKS,
    initialClock,
    initialTransport,
    parseClock,
    reduceClocks,
    reduceTransport,
    restedClocks,
    type Transport,
} from './playhead.ts';

const playing: Transport = { ...initialTransport, playing: true, at: 0.5 };

describe('reduceTransport', () => {
    it('advances by the elapsed share of the duration', () => {
        const next = reduceTransport(playing, { kind: 'advance', ms: 1000, duration: 8 });

        expect(next.at).toBeCloseTo(0.625);
    });

    it('wraps while looping and stops at the end otherwise', () => {
        const near = { ...playing, at: 0.95 };

        expect(reduceTransport(near, { kind: 'advance', ms: 1000, duration: 8 }).at).toBeCloseTo(
            0.075,
        );

        const once = reduceTransport(
            { ...near, looping: false },
            { kind: 'advance', ms: 1000, duration: 8 },
        );

        expect(once).toMatchObject({ at: 1, playing: false });
    });

    it('restarts from 0 when played again at the end', () => {
        const ended = { ...initialTransport, at: 1, looping: false };

        expect(reduceTransport(ended, { kind: 'command', command: 'toggle' })).toMatchObject({
            at: 0,
            playing: true,
        });
    });

    it('holds the playhead from grab to release without pausing', () => {
        const grabbed = reduceTransport(playing, {
            kind: 'scrub',
            scrub: { phase: 'grab', at: 0.3 },
        });

        expect(grabbed).toMatchObject({ at: 0.3, held: true, playing: true });

        const moved = reduceTransport(grabbed, {
            kind: 'scrub',
            scrub: { phase: 'move', at: 0.4 },
        });
        const released = reduceTransport(moved, {
            kind: 'scrub',
            scrub: { phase: 'release', at: 0.9 },
        });

        expect(released).toMatchObject({ at: 0.4, held: false, playing: true });
    });

    it('ignores a duration of 0, which cannot advance', () => {
        expect(reduceTransport(playing, { kind: 'advance', ms: 1000, duration: 0 })).toBe(playing);
    });
});

describe('reduceClocks', () => {
    const two = new Map([
        ['a', { ...initialClock, playing: true }],
        ['b', { ...initialClock, duration: 4 }],
    ]);

    it('advances only the clocks that play, each by its own duration', () => {
        const next = reduceClocks(two, { kind: 'advance', ms: 1000 });

        expect(next.get('a')?.at).toBeCloseTo(1 / 8);
        expect(next.get('b')?.at).toBe(0);
    });

    it('sends a command to one clock and starts a missing one from the default', () => {
        const next = reduceClocks(two, {
            kind: 'clock',
            store: 'c',
            command: { kind: 'duration', seconds: 3 },
        });

        expect(next.get('c')).toEqual({ ...initialClock, duration: 3 });
        expect(
            reduceClocks(two, {
                kind: 'clock',
                store: 'b',
                command: { kind: 'command', command: 'toggle' },
            }).get('b')?.playing,
        ).toBe(true);
    });

    it('starts a copy paused and drops clocks a prune does not keep', () => {
        expect(reduceClocks(two, { kind: 'copy', from: 'a', to: 'c' }).get('c')?.playing).toBe(
            false,
        );
        expect([...reduceClocks(two, { kind: 'keep', stores: new Set(['b']) }).keys()]).toEqual([
            'b',
        ]);
    });
});

describe('restedClocks', () => {
    it('keeps a playing clock where it stood still, and settles while it plays', () => {
        const still = new Map([['a', { ...initialClock, at: 0.25 }]]);
        const playing = new Map([['a', { ...initialClock, at: 0.6, playing: true }]]);

        expect(restedClocks(still, playing)).toBe(still);
        expect(
            restedClocks(still, new Map([['a', { ...initialClock, at: 0.6 }]])).get('a')?.at,
        ).toBe(0.6);
    });
});

describe('parseClock', () => {
    it('never restores a playing clock, and clamps what it reads', () => {
        expect(parseClock({ at: 4, playing: true, looping: false, duration: -1 })).toEqual({
            ...initialClock,
            at: 1,
            looping: false,
        });
    });
});

describe('ticks per loop', () => {
    it('start at the default, clamp a command, read a saved count and seed a placed clock', () => {
        const set = (count: number) =>
            reduceClocks(new Map(), {
                kind: 'clock',
                store: 'loop',
                command: { kind: 'ticks', count },
            }).get('loop')?.ticks;

        expect(initialClock.ticks).toBe(DEFAULT_TICKS);
        expect(set(200)).toBe(64);
        expect(set(0)).toBe(1);
        expect(set(7.6)).toBe(8);
        expect(parseClock({ ticks: 12 }).ticks).toBe(12);
        expect(parseClock({ ticks: 'many' }).ticks).toBe(DEFAULT_TICKS);
        expect(
            reduceClocks(new Map(), {
                kind: 'seed',
                to: 'loop',
                duration: 4,
                looping: true,
                ticks: 8,
            }).get('loop')?.ticks,
        ).toBe(8);
    });
});
