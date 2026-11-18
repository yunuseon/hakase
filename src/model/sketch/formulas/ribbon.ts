import type { Formula } from './formula.ts';
import source from './ribbon.glsl?raw';

export const ribbon: Formula = {
    label: 'Ribbon',
    summary:
        'Shows the space hook: the formula is a flat, waving strip, and space() twists it around the vertical axis, more the higher it goes. Try surface mode and orbit around it; k1 sets how far it twists.',
    source,
};
