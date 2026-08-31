import { clamp } from '../../lib/math.ts';
import { parseHexColor } from '../../lib/color.ts';

export type Stop = {
    readonly at: number;
    readonly color: string;
};

// `steps` holds each stop's colour until the next, with no blending between.
export type Blend = 'smooth' | 'steps';

export type Theme = {
    readonly stops: readonly Stop[];
    readonly blend: Blend;
};

export const RAMP_SIZE = 256;

export const ordered = (stops: readonly Stop[]): readonly Stop[] =>
    [...stops].sort((a, b) => a.at - b.at);

const mix = (from: number, to: number, t: number): number => from + (to - from) * t;

// One texture for both blends, so the shader never learns what a stop is.
export const buildRamp = ({ stops, blend }: Theme): Uint8Array => {
    const ramp = new Uint8Array(RAMP_SIZE * 4);
    const sorted = ordered(stops);
    const colors = sorted.map(({ color }) => parseHexColor(color));
    const last = sorted.length - 1;

    for (let index = 0; index < RAMP_SIZE; index += 1) {
        const t = index / (RAMP_SIZE - 1);

        let next = 0;
        while (next <= last && (sorted[next]?.at ?? 1) <= t) {
            next += 1;
        }

        const before = colors[clamp(next - 1, 0, last)];
        const after = colors[clamp(next, 0, last)];

        if (before === undefined || after === undefined) {
            continue;
        }

        const from = sorted[clamp(next - 1, 0, last)]?.at ?? 0;
        const to = sorted[clamp(next, 0, last)]?.at ?? 1;
        const span = to - from;
        const weight = blend === 'steps' || span <= 0 ? 0 : clamp((t - from) / span, 0, 1);

        ramp[index * 4] = Math.round(mix(before.r, after.r, weight) * 255);
        ramp[index * 4 + 1] = Math.round(mix(before.g, after.g, weight) * 255);
        ramp[index * 4 + 2] = Math.round(mix(before.b, after.b, weight) * 255);
        ramp[index * 4 + 3] = 255;
    }

    return ramp;
};

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

export const sameTheme = (a: Theme, b: Theme): boolean =>
    a.blend === b.blend &&
    a.stops.length === b.stops.length &&
    a.stops.every((stop, index) => {
        const other = b.stops[index];

        return other !== undefined && stop.at === other.at && stop.color === other.color;
    });
