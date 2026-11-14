import { describe, expect, it } from 'vitest';
import { defaultPanel, type Signals } from '../components/sketch/params.ts';
import { DEFAULT_ORBIT } from '../components/sketch/space.ts';
import { themes } from '../components/sketch/themes/registry.ts';
import type { Image, PointsImage } from '../image.ts';
import { defaultPedal } from '../pedals.ts';
import { defaultSignal } from '../shared/signal.ts';
import { hasHistory } from '../image.ts';

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

const points = (extra: Partial<PointsImage> = {}): PointsImage => ({
    kind: 'points',
    store: 'sketch-2',
    source: 'vec3 formula',
    panel: defaultPanel,
    theme: themes.paper,
    orbit: DEFAULT_ORBIT,
    drivers: undriven,
    sheet: null,
    ...extra,
});

const through = (kind: 'feedback' | 'blur', input: Image): Image => ({
    kind: 'pedal',
    store: `${kind}-1`,
    pedal: defaultPedal(kind),
    theme: null,
    drivers: {},
    inputs: [input],
});

describe('an export warms up', () => {
    it('only when some stage reads its own past: feedback, or trails set or driven', () => {
        expect(hasHistory(points())).toBe(false);
        expect(hasHistory(through('blur', points()))).toBe(false);
        expect(hasHistory(through('blur', through('feedback', points())))).toBe(true);
        expect(hasHistory(points({ panel: { ...defaultPanel, trails: 0.4 } }))).toBe(true);
        expect(
            hasHistory(
                points({
                    drivers: {
                        ...undriven,
                        trails: {
                            signal: defaultSignal,
                            mods: { phase: null, offset: null, depth: null },
                        },
                    },
                }),
            ),
        ).toBe(true);
    });
});
