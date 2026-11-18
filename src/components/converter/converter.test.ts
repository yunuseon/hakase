import { describe, expect, it } from 'vitest';
import { boundsOf, converterSections, converterView, HEIGHT, pathOf, WIDTH } from './converter.ts';

describe('a converter view', () => {
    it('keeps 0 and 1 in view, and widens to whatever the curve reaches', () => {
        expect(boundsOf([0.2, 0.4])).toEqual({ low: 0, high: 1 });
        expect(boundsOf([-2, 5])).toEqual({ low: -2, high: 5 });
    });

    it('closes the curve back to its first sample, since a loop loops', () => {
        const path = pathOf([0, 1]);

        expect(path.startsWith(`M0.0 ${HEIGHT.toFixed(1)}`)).toBe(true);
        expect(path.endsWith(`L${WIDTH} ${HEIGHT.toFixed(1)}`)).toBe(true);
    });

    it('says what to plug in while nothing is', () => {
        const view = converterView({
            summary: 's',
            samples: null,
            value: null,
            t: 0.5,
            empty: 'Nothing plugged into in.',
        });

        expect(view.empty).toBe('Nothing plugged into in.');
        expect(view.value).toBe('–');
    });

    it('lists the item picker only when there is something to pick, and a shape only for a level', () => {
        const base = {
            choices: [{ id: 'a', title: 'A' }],
            choice: 'a',
            items: [],
            item: '',
            shape: null,
            bits: { invert: false, hold: 0, threshold: 0.5, band: 0 },
            thresholded: true,
        };
        const plain = converterSections(base);
        const picked = converterSections({ ...base, items: [{ id: 'x', title: 'X' }], item: 'x' });

        expect(plain.map(({ id }) => id)).toEqual(['reading', 'bits']);
        expect(plain[0]?.properties.map(({ id }) => id)).toEqual(['reading']);
        expect(picked[0]?.properties.map(({ id }) => id)).toEqual(['item', 'reading']);
        expect(plain[1]?.properties.map(({ id }) => id)).toEqual([
            'bits.threshold',
            'bits.band',
            'bits.invert',
            'bits.hold',
        ]);
    });
});
