import type { Formula } from './formula.ts';
import source from './torus.glsl?raw';

export const torus: Formula = {
    label: 'Torus',
    summary:
        'x and y become the two angles around a doughnut: around the ring and around the tube. The tube breathes, and the whole shape turns in 3D with a simple perspective.',
    source,
};
