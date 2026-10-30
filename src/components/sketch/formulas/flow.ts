import type { Formula } from './formula.ts';
import source from './flow.glsl?raw';

export const flow: Formula = {
    label: 'Flow',
    summary:
        "A swirling vector field. Each point is nudged along the flow, its size is the flow's speed, and its colour is the direction it is heading. Try lines mode. k1 sets how far points travel and k2 rotates the colours.",
    source,
};
