import { describe, expect, it } from 'vitest';
import { knobLabelsOf } from './sketch-program.ts';

describe('knobLabelsOf', () => {
    it('reads names from #define lines, with underscores as spaces', () => {
        expect(
            knobLabelsOf('#define K1 feed\n#define K3 camera_height\nvec3 formula() {}'),
        ).toEqual({
            k1: 'feed',
            k2: 'k2',
            k3: 'camera height',
            k4: 'k4',
        });
    });

    it('ignores what is not a name on a line of its own', () => {
        expect(knobLabelsOf('#define K1 feed rate\n// #define K2 x\nfloat K3 = 1.0;')).toEqual({
            k1: 'k1',
            k2: 'k2',
            k3: 'k3',
            k4: 'k4',
        });
    });
});
