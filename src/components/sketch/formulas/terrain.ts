import type { Formula } from './formula.ts';
import source from './terrain.glsl?raw';

export const terrain: Formula = {
    label: 'Terrain',
    source,
};
