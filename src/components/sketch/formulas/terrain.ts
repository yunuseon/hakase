import type { Formula } from './formula.ts';
import source from './terrain.glsl?raw';

export const terrain: Formula = {
    label: 'Terrain',
    summary:
        'Rolling hills flying past under a scripted camera that hangs low over the ground and sways as t advances. k1 raises the hills and k2 lifts the camera. Drag to look around from there; double-click to go back to the scripted view.',
    source,
};
