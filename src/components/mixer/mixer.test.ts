import { describe, expect, it } from 'vitest';
import type { MixStrip } from '../../program.ts';
import { meterOf, mixerView } from './mixer.ts';

const strip = (store: string, muted = false): MixStrip => ({
    store,
    program: 'voice',
    name: store,
    colour: '#000000',
    volume: 0.5,
    muted,
    chain: null,
});

describe('a mixer view', () => {
    it('hears nothing while not listening, and every unmuted strip once it is', () => {
        const strips = [strip('a'), strip('b', true)];

        expect(mixerView(strips, false, new Set()).strips.map(({ heard }) => heard)).toEqual([
            false,
            false,
        ]);
        expect(mixerView(strips, true, new Set()).strips.map(({ heard }) => heard)).toEqual([
            true,
            false,
        ]);
    });

    it('hears only the soloed strips while any is soloed, muted or not', () => {
        const strips = [strip('a'), strip('b', true), strip('c')];
        const view = mixerView(strips, true, new Set(['b']));

        expect(view.strips.map(({ heard }) => heard)).toEqual([false, true, false]);
        expect(view.strips.map(({ soloed }) => soloed)).toEqual([false, true, false]);
        expect(view.strips[0]?.percent).toBe('50%');
    });

    it('meters a heard strip within 0 and 1, and an unheard one at nothing', () => {
        expect(meterOf(1.4, true)).toBe(1);
        expect(meterOf(0.4, true)).toBe(0.4);
        expect(meterOf(0.4, false)).toBe(0);
    });
});
