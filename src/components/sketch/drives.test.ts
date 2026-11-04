import { describe, expect, it } from 'vitest';
import { defaultSignal, waveOf } from '../../shared/signal.ts';
import { colourShiftAt, focusAt, turnAt, type Signals } from './params.ts';

const none: Signals = {
    k1: null,
    k2: null,
    k3: null,
    k4: null,
    turn: null,
    focus: null,
    colour: null,
};
const sine = waveOf(new Map([['s', defaultSignal]]), 's');

describe('scene drives', () => {
    it('change nothing while unbound', () => {
        expect(turnAt({ signals: none }, 0.3)).toBe(0);
        expect(focusAt({ focus: 1.4, signals: none }, 0.3)).toBe(1.4);
        expect(colourShiftAt({ signals: none }, 0.3)).toBe(0);
    });

    it('take the value as it is: turns, the focus itself, an offset along the ramp', () => {
        const three = waveOf(new Map([['s', { ...defaultSignal, offset: 3, depth: 0 }]]), 's');
        const signals = { ...none, turn: three, focus: three, colour: three };

        expect(turnAt({ signals }, 0.2)).toBeCloseTo(6 * Math.PI);
        expect(focusAt({ focus: 1, signals }, 0.2)).toBeCloseTo(3);
        expect(colourShiftAt({ signals }, 0.2)).toBeCloseTo(3);
    });

    it('turn back to where they began when the signal loops', () => {
        const signals = { ...none, turn: sine };

        expect(turnAt({ signals }, 1)).toBeCloseTo(turnAt({ signals }, 0));
    });

    it('keep the focus where the lattice still has room', () => {
        const far = waveOf(new Map([['s', { ...defaultSignal, offset: 50, depth: 0 }]]), 's');

        expect(focusAt({ focus: 1, signals: { ...none, focus: far } }, 0)).toBe(10);
    });
});
