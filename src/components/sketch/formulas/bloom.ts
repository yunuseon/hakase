import type { Formula } from './formula.ts';
import source from './bloom.glsl?raw';

export const bloom: Formula = {
    label: 'Bloom',
    source,
};
