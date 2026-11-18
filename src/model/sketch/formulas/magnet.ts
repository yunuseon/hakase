import type { Formula } from './formula.ts';
import source from './magnet.glsl?raw';

export const magnet: Formula = {
    label: 'Magnet',
    summary:
        'Move the mouse over the sketch: the lattice is pulled toward where the pointer touches the ground, and rings spread out from it. Shift-drag to pull twice as hard. k1 sets the reach, k2 the pull, k3 the ring spacing, and k4 turns the colours, which follow the angle to the pointer.',
    source,
};
