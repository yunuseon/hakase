import type { Formula } from './formula.ts';
import source from './weave.glsl?raw';

export const weave: Formula = {
    label: 'Weave',
    source,
};
