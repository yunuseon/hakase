import type { Formula } from './formula.ts';
import source from './stencil.glsl?raw';

export const stencil: Formula = {
    label: 'Stencil',
    summary:
        'Only what is painted comes forward: inked points rise towards the camera and take the full colour of the theme, the rest sink back into the backdrop, and a diagonal wave sweeps over the shape. Plug a paint window into the sketch.',
    source,
};
