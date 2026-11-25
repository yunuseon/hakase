import { describe, expect, it } from 'vitest';
import { defaultPanel, type Signals } from './model/sketch/params.ts';
import { DEFAULT_ORBIT } from './model/sketch/space.ts';
import { themes } from './model/sketch/themes/registry.ts';
import {
    knobAt,
    NONE,
    sameImage,
    samplesAt,
    samplesWanted,
    SAMPLE_BUDGET,
    sceneKnobAt,
    stagesOf,
    stillOf,
    type Image,
    type PedalImage,
    type PointsImage,
    type TracedImage,
} from './image.ts';
import { defaultScene } from './model/scene.ts';
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

const traced = (store: string): TracedImage => ({
    kind: 'traced',
    store,
    scene: defaultScene,
    theme: themes.paper,
    drivers: { k1: null, k2: null, k3: null, k4: null },
});

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
    it('stand still for a tile: trails off in every sketch of a chain, set or driven', () => {
        const trailing: PointsImage = {
            ...points('a'),
            panel: { ...defaultPanel, trails: 0.6 },
            drivers: { ...undriven, trails: { samples: new Float32Array([0.2, 0.8]) } },
        };
        const still = stillOf(pedal('mix', [trailing, points('b')]));
        const [first] = still.kind === 'pedal' ? still.inputs : [];

        expect(first).toMatchObject({ panel: { trails: 0 }, drivers: { trails: null } });
        expect(still.kind === 'pedal' && still.pedal).toBe(mix);
        expect(stillOf(NONE)).toBe(NONE);
    });

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

    it('compare a traced stage by its scene, theme and knob drivers', () => {
        const scene = traced('scene-1');

        expect(sameImage(scene, traced('scene-1'))).toBe(true);
        expect(sameImage(scene, { ...scene, scene: { ...defaultScene } })).toBe(false);
        expect(sameImage(scene, traced('scene-2'))).toBe(false);
        expect(stagesOf(pedal('mix', [scene, points('a')])).map(({ store }) => store)).toEqual([
            'scene-1',
            'a',
            'mix',
        ]);
    });

    it('ask for the most samples any traced stage wants, and 1 with none traced', () => {
        const fine: TracedImage = {
            ...traced('fine'),
            scene: { ...defaultScene, preview: 512, export: 32 },
        };

        expect(samplesWanted(pedal('mix', [traced('a'), fine]), 'preview')).toBe(512);
        expect(samplesWanted(pedal('mix', [traced('a'), fine]), 'export')).toBe(
            defaultScene.export,
        );
        expect(samplesWanted(points('a'), 'preview')).toBe(1);
    });

    it('refine as many samples a frame as the pixel budget allows, up to the cap', () => {
        expect(samplesAt(0, SAMPLE_BUDGET, 256)).toBe(1);
        expect(samplesAt(9, SAMPLE_BUDGET, 256)).toBe(10);
        expect(samplesAt(0, SAMPLE_BUDGET / 4, 256)).toBe(4);
        expect(samplesAt(1000, SAMPLE_BUDGET, 256)).toBe(256);
        expect(samplesAt(0, SAMPLE_BUDGET * 16, 256)).toBe(1);
    });

    it('read a scene knob from its driver, or as set', () => {
        const scene = traced('a');

        expect(sceneKnobAt(scene, 'k2', 0.3)).toBe(defaultScene.knobs.k2);
        expect(
            sceneKnobAt(
                {
                    ...scene,
                    drivers: { ...scene.drivers, k2: { samples: new Float32Array([0.9]) } },
                },
                'k2',
                0.3,
            ),
        ).toBeCloseTo(0.9);
    });
});
