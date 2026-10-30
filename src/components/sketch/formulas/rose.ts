import type { Formula } from './formula.ts';
import source from './rose.glsl?raw';

export const rose: Formula = {
    label: 'Rose',
    summary:
        'Points are pulled in and out along their angle by a five-petal cosine. Turning t rotates the petals, and the depth follows how far out they reach.',
    source,
};
