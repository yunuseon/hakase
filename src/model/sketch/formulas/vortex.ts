import type { Formula } from './formula.ts';
import source from './vortex.glsl?raw';

export const vortex: Formula = {
    label: 'Vortex',
    summary:
        "Points swirl around the mouse, harder the closer they are, and the swirl breathes with t. The colour follows each point's twisted angle, so the colour bands wind into a spiral that shows the twist. k1 sets the strength, k2 how quickly it fades with distance, and k4 rotates the colours.",
    source,
};
