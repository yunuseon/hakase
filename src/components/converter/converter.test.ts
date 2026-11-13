import { describe, expect, it } from 'vitest';
import { boundsOf, converterView, HEIGHT, pathOf, WIDTH } from './converter.ts';

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

    it('says what to plug in while nothing is, and shows no shape it was not given', () => {
        const view = converterView({
            summary: 's',
            choices: [{ id: 'a', title: 'A' }],
            choice: 'a',
            samples: null,
            value: null,
            t: 0.5,
            empty: 'Nothing plugged into in.',
            shape: null,
            bits: null,
            thresholded: false,
        });

        expect(view.empty).toBe('Nothing plugged into in.');
        expect(view.value).toBe('–');
        expect(view.choices).toEqual([{ id: 'a', title: 'A', checked: true }]);
        expect(view.shape).toBeNull();
    });
});
