import type { Formula } from './formula.ts';
import source from './canon.glsl?raw';

export const canon: Formula = {
    label: 'Canon',
    summary:
        'A vibrating plate made to be played by music. k3 follows a melody in octaves, and each note picks its own Chladni figure; k2 is how loud the arpeggio is, so every struck note shakes the figure up; k1, the bass, sends a ring out from the middle on every beat; and k4, the drums, makes the plate jump. The arpeggio also flashes the colour, which rises with the melody. The camera circles once a loop.',
    source,
};
