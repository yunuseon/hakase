import type { Formula } from './formula.ts';
import source from './trefoil.glsl?raw';

export const trefoil: Formula = {
    label: 'Trefoil',
    summary:
        'A tube swept along a trefoil knot. x runs along the knot and y around the tube. The knot itself holds still: its camera function circles it once per loop and rises and dips, which is the motion you see.',
    source,
};
