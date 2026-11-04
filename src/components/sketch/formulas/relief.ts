import type { Formula } from './formula.ts';
import source from './relief.glsl?raw';

export const relief: Formula = {
    label: 'Relief',
    summary:
        'A painting as land: wherever the paint input is inked, the lattice rises, and a slow swell breathes across the hills. Plug a paint window into the sketch, try surface mode, and k1 sets how tall it stands.',
    source,
};
