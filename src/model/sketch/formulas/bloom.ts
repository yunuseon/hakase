import type { Formula } from './formula.ts';
import source from './bloom.glsl?raw';

export const bloom: Formula = {
    label: 'Bloom',
    summary:
        'A sphere whose radius is pushed out by waves in both angles, giving a flower-like shape that breathes and rotates with t.',
    source,
};
