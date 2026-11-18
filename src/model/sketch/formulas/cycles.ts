import type { Formula } from './formula.ts';
import source from './cycles.glsl?raw';

export const cycles: Formula = {
    label: 'Cycles',
    summary:
        'Shows evolve() organising noise: fourteen colours in a loop, and a point moves on to the next colour once a neighbour already shows it. Out of random static, waves form and wind into rotating spirals that take over the field. Past half on k1 it takes two neighbours instead of one, and the noise holds out much longer.',
    source,
};
