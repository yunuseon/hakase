import type { Formula } from './formula.ts';
import source from './drift.glsl?raw';

export const drift: Formula = {
    label: 'Drift',
    summary:
        'Points slide along the contour lines of a painting, circling whatever was painted, and lean towards the ink as they go. Plug a paint window into the sketch; k1 sets how far they travel.',
    source,
};
