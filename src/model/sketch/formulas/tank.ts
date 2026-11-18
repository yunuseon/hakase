import type { Formula } from './formula.ts';
import source from './tank.glsl?raw';

export const tank: Formula = {
    label: 'Tank',
    summary:
        'Shows evolve(): a ripple tank where every point keeps its height and the one before, and each step spreads waves to the neighbours. Four drops fall every loop, and shift-dragging drops more under the mouse. Best as a surface; k1 sets the wave speed and k2 how slowly the waves die away.',
    source,
};
