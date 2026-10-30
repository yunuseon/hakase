import type { Formula } from './formula.ts';
import source from './peaks.glsl?raw';

export const peaks: Formula = {
    label: 'Peaks',
    summary:
        'Three crossing waves summed on a flat grid. Peaks and troughs both draw big dots, because depth is how far the sum is from zero, but the tint is the sum itself, so peaks and troughs take opposite ends of the theme. k1 tightens the diagonal wave.',
    source,
};
