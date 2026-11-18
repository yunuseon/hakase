import { clamp } from '../../lib/math.ts';
import { ordered, type Theme } from '../../model/sketch/theme.ts';

// The same ramp as CSS: change this rule and buildRamp together or they drift.
export const gradientCss = ({ stops, blend }: Theme): string => {
    const sorted = ordered(stops);
    const percent = (at: number) => `${(clamp(at, 0, 1) * 100).toFixed(2)}%`;

    if (blend === 'smooth') {
        const list = sorted.map(({ color, at }) => `${color} ${percent(at)}`);

        return `linear-gradient(90deg, ${list.join(', ')})`;
    }

    const bands = sorted.flatMap(({ color, at }, index) => {
        const next = sorted[index + 1];

        return [`${color} ${percent(at)}`, `${color} ${percent(next?.at ?? 1)}`];
    });

    return `linear-gradient(90deg, ${bands.join(', ')})`;
};
