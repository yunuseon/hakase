import type { Formula } from './formula.ts';
import source from './torus.glsl?raw';

export const torus: Formula = {
    label: 'Torus',
    summary:
        'x and y become the two angles around a doughnut: around the ring and around the tube. The tube breathes and the shape tumbles with t. Point at it and the surface under the mouse ray swells and brightens; shift-drag to press it out further. Drag to orbit.',
    source,
};
