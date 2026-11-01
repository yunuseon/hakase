import type { Formula } from './formula.ts';
import source from './sandpile.glsl?raw';

export const sandpile: Formula = {
    label: 'Sandpile',
    summary:
        'Shows evolve() counting: grains drop onto the middle, and any point holding four topples one onto each neighbour. Nothing but that rule grows a fractal mandala, coloured by how many grains each point holds. Raise the lattice to 64 or more for room to grow; k1 sets how tall the grains stand.',
    source,
};
