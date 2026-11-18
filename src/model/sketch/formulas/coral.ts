import type { Formula } from './formula.ts';
import source from './coral.glsl?raw';

export const coral: Formula = {
    label: 'Coral',
    summary:
        'Shows evolve() as reaction-diffusion: two chemicals per point, one feeding the other as both spread, so spots grow into coral, worms and mazes. Shift-drag to seed more. It runs 480 steps a second, so looping back costs a moment. Raise the lattice for finer detail; k1 sets the feed rate and k2 the kill rate, which decide the pattern.',
    source,
};
