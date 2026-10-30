import type { Formula } from './formula.ts';
import source from './weave.glsl?raw';

export const weave: Formula = {
    label: 'Weave',
    summary:
        'Each row is pushed sideways by a sine of its height and each column by a sine of its width, so the grid ripples like woven cloth.',
    source,
};
