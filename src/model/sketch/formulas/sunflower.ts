import type { Formula } from './formula.ts';
import source from './sunflower.glsl?raw';

export const sunflower: Formula = {
    label: 'Sunflower',
    summary:
        'Shows the lattice hook: lattice() lays the points on rings of equal area, each turned a little further than the last, so they wind into spiral arms like the seeds of a sunflower. Rings pulse outward through them. Works in every mode; k1 sets the ring spacing and k2 how far the arms wind.',
    source,
};
