import type { Formula } from './formula.ts';
import source from './spiral.glsl?raw';

export const spiral: Formula = {
    label: 'Spiral',
    summary:
        'Every point is turned around the centre by an amount that grows with its distance, which winds the lattice into three arms that rotate as t advances.',
    source,
};
