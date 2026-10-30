import type { Formula } from './formula.ts';
import source from './trefoil.glsl?raw';

export const trefoil: Formula = {
    label: 'Trefoil',
    summary:
        'A tube swept along a trefoil knot. x runs along the knot, y runs around the tube, and t spins the tube and the whole knot.',
    source,
};
