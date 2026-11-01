import type { Formula } from './formula.ts';
import source from './life.glsl?raw';

export const life: Formula = {
    label: 'Life',
    summary:
        'Shows evolve() as a cellular automaton: Conway rules, where a cell is born with three live neighbours and survives with two or three. Ten generations a second, from random noise, with a glow that fades where cells died. Shift-drag to draw live cells. Best as dots on a fine lattice; k1 sets how much starts alive and k2 how long the glow lasts.',
    source,
};
