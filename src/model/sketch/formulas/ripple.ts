import type { Formula } from './formula.ts';
import source from './ripple.wgsl?raw';

export const ripple: Formula = {
    label: 'Ripple',
    summary:
        "Rings spread out from the centre. Each point's distance from the middle sets its depth, and a sine wave travelling with t bends the rows up and down.",
    source,
};
