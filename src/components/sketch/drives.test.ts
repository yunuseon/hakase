import { describe, expect, it } from 'vitest';
import { defaultSignal, waveOf } from '../../shared/signal.ts';
import {
    colourShiftAt,
    DRIVES,
    dotsAt,
    focusAt,
    orbitAt,
    trailsAt,
    type Signals,
} from './params.ts';

const none: Signals = {
    k1: null,
    k2: null,
    k3: null,
    k4: null,
    turn: null,
    pitch: null,
    distance: null,
    focus: null,
    colour: null,
    size: null,
    depth: null,
    trails: null,
};
const orbit = { yaw: 0.1, pitch: 0.2, distance: 4 };
const dots = { mode: 'dots', baseSize: 5, depthScalar: 1 } as const;
const constant = (value: number) =>
    waveOf(new Map([['s', { ...defaultSignal, offset: value, depth: 0 }]]), 's');
const sine = waveOf(new Map([['s', defaultSignal]]), 's');

describe('scene drives', () => {
    it('change nothing while unbound', () => {
        expect(orbitAt({ signals: none }, orbit, 0.3)).toEqual(orbit);
        expect(focusAt({ focus: 1.4, signals: none }, 0.3)).toBe(1.4);
        expect(colourShiftAt({ signals: none }, 0.3)).toBe(0);
        expect(dotsAt({ draw: dots, signals: none }, 0.3)).toEqual({
            baseSize: 5,
            depthScalar: 1,
        });
        expect(trailsAt({ trails: 0.4, signals: none }, 0.3)).toBe(0.4);
    });

    it('take the value as it is, in each one’s own unit', () => {
        const signals = Object.fromEntries(DRIVES.map(drive => [drive, constant(0.1)]));
        const all = { ...none, ...signals };

        expect(orbitAt({ signals: all }, orbit, 0.2).yaw).toBeCloseTo(0.1 + 0.2 * Math.PI);
        expect(orbitAt({ signals: all }, { ...orbit, pitch: 0 }, 0.2).pitch).toBeCloseTo(
            0.2 * Math.PI,
        );
        expect(dotsAt({ draw: dots, signals: { ...none, size: constant(12) } }, 0)).toEqual({
            baseSize: 12,
            depthScalar: 1,
        });
        expect(trailsAt({ trails: 0, signals: all }, 0.2)).toBeCloseTo(0.1);
        expect(orbitAt({ signals: { ...none, distance: constant(7) } }, orbit, 0).distance).toBe(7);
    });

    it('turn back to where they began when the signal loops', () => {
        const signals = { ...none, turn: sine, pitch: sine };

        expect(orbitAt({ signals }, orbit, 1).yaw).toBeCloseTo(orbitAt({ signals }, orbit, 0).yaw);
    });

    it('keep every value where the picture still works', () => {
        const far = constant(50);
        const signals = { ...none, focus: far, pitch: far, distance: far, size: far, trails: far };

        expect(focusAt({ focus: 1, signals }, 0)).toBe(10);
        expect(Math.abs(orbitAt({ signals }, orbit, 0).pitch)).toBeLessThan(Math.PI / 2);
        expect(orbitAt({ signals }, orbit, 0).distance).toBe(30);
        expect(trailsAt({ trails: 0, signals }, 0)).toBeLessThan(1);
        expect(dotsAt({ draw: { mode: 'lines' }, signals }, 0)).toBeNull();
    });
});
