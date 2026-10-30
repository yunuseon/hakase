import type { Formula } from './formula.ts';
import source from './terrain.glsl?raw';

export const terrain: Formula = {
    label: 'Terrain',
    summary:
        'A landscape seen in perspective. y is distance from the viewer, nearer rows are wider and taller, and t flies forward over the hills.',
    source,
};
