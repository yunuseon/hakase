import type { Formula } from './formula.ts';
import source from './interference.glsl?raw';

export const interference: Formula = {
    label: 'Interference',
    source,
};
