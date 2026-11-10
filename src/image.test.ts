import { describe, expect, it } from 'vitest';
import { defaultPanel, type Signals } from './components/sketch/params.ts';
import { DEFAULT_ORBIT } from './components/sketch/space.ts';
import { themes } from './components/sketch/themes/registry.ts';
import {
    knobAt,
    NONE,
    sameImage,
    stagesOf,
    type Image,
    type PedalImage,
    type PointsImage,
} from './image.ts';
import { defaultPedal } from './pedals.ts';
import { defaultSignal } from './shared/signal.ts';

const undriven: Signals = {
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

const points = (store: string, source = 'vec3 formula'): PointsImage => ({
    kind: 'points',
    store,
    source,
    panel: defaultPanel,
    theme: themes.paper,
    orbit: DEFAULT_ORBIT,
    drivers: undriven,
    sheet: null,
});

const mix = defaultPedal('mix');

const pedal = (
    store: string,
    inputs: readonly Image[],
    extra: Partial<PedalImage> = {},
): PedalImage => ({
    kind: 'pedal',
    store,
    pedal: mix,
    theme: null,
    drivers: {},
    inputs,
    ...extra,
});

describe('image recipes', () => {
    it('compare by what they draw, not by which object carried them', () => {
        expect(sameImage(points('sketch-2'), points('sketch-2'))).toBe(true);
        expect(sameImage(points('sketch-2'), points('sketch-2', 'vec4 formula'))).toBe(false);
        expect(sameImage(pedal('mix-1', [points('a')]), pedal('mix-1', [points('a')]))).toBe(true);
        expect(sameImage(pedal('mix-1', [points('a')]), pedal('mix-1', [points('b')]))).toBe(false);
        expect(sameImage(NONE, { kind: 'none' })).toBe(true);
        expect(
            sameImage(
                pedal('mix-1', [], {
                    drivers: {
                        amount: {
                            signal: defaultSignal,
                            mods: { phase: null, offset: null, depth: null },
                        },
                    },
                }),
                pedal('mix-1', [], {
                    drivers: {
                        amount: {
                            signal: defaultSignal,
                            mods: { phase: null, offset: null, depth: null },
                        },
                    },
                }),
            ),
        ).toBe(true);
    });

    it('cook every stage once, inputs first, however many cables lead to it', () => {
        const source = points('sketch-2');
        const left = pedal('kaleido-1', [source]);
        const right = pedal('blur-1', [source]);
        const order = stagesOf(pedal('mix-1', [left, right])).map(({ store }) => store);

        expect(order).toEqual(['sketch-2', 'kaleido-1', 'blur-1', 'mix-1']);
        expect(stagesOf(NONE)).toEqual([]);
    });

    it('read a driven knob from its driver, kept inside the knob, and an undriven one as set', () => {
        const swell = {
            signal: { ...defaultSignal, offset: 4, depth: 0 },
            mods: { phase: null, offset: null, depth: null },
        };

        expect(knobAt(pedal('mix-1', []), 'amount', 0.3)).toBe(0.5);
        expect(knobAt(pedal('mix-1', [], { drivers: { amount: swell } }), 'amount', 0.3)).toBe(1);
        expect(knobAt(pedal('mix-1', []), 'nonsense', 0.3)).toBe(0);
    });
});
