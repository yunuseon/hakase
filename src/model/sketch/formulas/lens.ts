import type { Formula } from './formula.ts';
import source from './lens.glsl?raw';

export const lens: Formula = {
    label: 'Lens',
    summary:
        'Move the mouse over the sketch: a magnifying glass follows it and spreads the lattice apart underneath. k1 sets the lens size and k2 the magnification. Uses pointer only, so the colour still follows depth.',
    source,
};
