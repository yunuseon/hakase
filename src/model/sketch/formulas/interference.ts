import type { Formula } from './formula.ts';
import source from './interference.glsl?raw';

export const interference: Formula = {
    label: 'Interference',
    summary:
        'Two wave sources slide back and forth along the x axis. Where their crests meet the depth adds up, and where a crest meets a trough it cancels.',
    source,
};
