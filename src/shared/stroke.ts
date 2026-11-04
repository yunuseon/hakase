import type { Picture } from './picture.ts';

// x, y, radius and flow per dab, then where in the loop it is laid: x, y and radius as fractions of the square.
export const DAB = 5;
export const INK_SIDE = 512;

export type Stroke = {
    readonly dabs: Float32Array;
    readonly whole: boolean;
    readonly hardness: number;
};

export type Sheet = Picture | Stroke;

export const isStroke = (sheet: Sheet): sheet is Stroke => 'dabs' in sheet;

export const dabCount = ({ dabs }: Stroke) => dabs.length / DAB;

// Dabs are laid in loop order, so those down by t are a prefix, found by halving.
export const dabsAt = (stroke: Stroke, t: number) => {
    const count = dabCount(stroke);

    if (stroke.whole) {
        return count;
    }

    const at = ((t % 1) + 1) % 1;
    let low = 0;
    let high = count;

    while (low < high) {
        const middle = (low + high) >> 1;

        if ((stroke.dabs[middle * DAB + 4] ?? 0) <= at) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }

    return low;
};
