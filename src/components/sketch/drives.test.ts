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

    it('turn the camera a whole turn over the signal, ending where it began', () => {
        const signals = { ...none, turn: sine };

        expect(turnAt({ signals }, 0.5)).toBeCloseTo(2 * Math.PI);
        expect(turnAt({ signals }, 1)).toBeCloseTo(turnAt({ signals }, 0));
    });

    it('read focus on a log scale from 0.3 to 3, and centre the colour shift', () => {
        const signals = { ...none, focus: sine, colour: sine };

        expect(focusAt({ focus: 1, signals }, 0)).toBeCloseTo(0.3);
        expect(focusAt({ focus: 1, signals }, 0.5)).toBeCloseTo(3);
        expect(colourShiftAt({ signals }, 0)).toBeCloseTo(-0.5);
        expect(colourShiftAt({ signals }, 0.5)).toBeCloseTo(0.5);
    });
});
