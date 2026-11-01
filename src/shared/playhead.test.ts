import { describe, expect, it } from 'vitest';
import { initialTransport, reduceTransport, type Transport } from './playhead.ts';

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
