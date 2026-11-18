import type { Formula } from './formula.ts';
import source from './klein.glsl?raw';

export const klein: Formula = {
    label: 'Klein',
    summary:
        'A figure-eight Klein bottle, a surface with no inside or outside. The half-angle twist is shifted by t, so the surface slowly turns itself inside out.',
    source,
};
