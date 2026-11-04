import type { Frame } from './picture.ts';

export const SYMMETRIES = ['none', 'mirror', 'quad', 'spin-3', 'spin-6', 'kaleido'] as const;
export type Symmetry = (typeof SYMMETRIES)[number];
export const isSymmetry = (value: string): value is Symmetry =>
    SYMMETRIES.some(symmetry => symmetry === value);

export const INKS = ['brush', 'erase', 'soften'] as const;
export type Ink = (typeof INKS)[number];

export type Brush = {
    readonly tool: Ink;
    readonly size: number;
    readonly hardness: number;
    readonly flow: number;
};

export type Point = { readonly x: number; readonly y: number };

const TAU = 2 * Math.PI;

const rotations = (count: number) =>
    Array.from({ length: count }, (_, index) => (index * TAU) / count);

export const copiesOf = ({ x, y }: Point, symmetry: Symmetry): readonly Point[] => {
    const cx = x - 0.5;
    const cy = y - 0.5;
    const turned = (angles: readonly number[], mirrored: boolean) =>
        angles.flatMap(angle => {
            const point = {
                x: 0.5 + cx * Math.cos(angle) - cy * Math.sin(angle),
                y: 0.5 + cx * Math.sin(angle) + cy * Math.cos(angle),
            };

            return mirrored ? [point, { x: 1 - point.x, y: point.y }] : [point];
        });

    switch (symmetry) {
        case 'none':
            return [{ x, y }];
        case 'mirror':
            return [
                { x, y },
                { x: 1 - x, y },
            ];
        case 'quad':
            return [
                { x, y },
                { x: 1 - x, y },
                { x, y: 1 - y },
                { x: 1 - x, y: 1 - y },
            ];
        case 'spin-3':
            return turned(rotations(3), false);
        case 'spin-6':
            return turned(rotations(6), false);
        case 'kaleido':
            return turned(rotations(6), true);
    }
};

const clampInk = (value: number) => Math.max(0, Math.min(255, value));

export const smoothstep = (edge0: number, edge1: number, value: number) => {
    const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(edge1 - edge0, 1e-6)));

    return t * t * (3 - 2 * t);
};

export const averageAround = (frame: Frame, side: number, px: number, py: number) => {
    let total = 0;
    let count = 0;

    for (let y = Math.max(0, py - 1); y <= Math.min(side - 1, py + 1); y += 1) {
        for (let x = Math.max(0, px - 1); x <= Math.min(side - 1, px + 1); x += 1) {
            total += frame[y * side + x] ?? 0;
            count += 1;
        }
    }

    return total / Math.max(count, 1);
};

// One soft disc, centred in pixels; a working copy so a stroke rounds once, at its end.
const stamped = (
    ink: number[],
    before: Frame,
    side: number,
    centre: Point,
    { tool, size, hardness, flow }: Brush,
) => {
    const radius = Math.max(0.5, size / 2);
    const inner = radius * Math.max(0, Math.min(1, hardness));
    const reach = radius + 0.5;

    for (let py = Math.floor(centre.y - reach); py <= Math.ceil(centre.y + reach); py += 1) {
        for (let px = Math.floor(centre.x - reach); px <= Math.ceil(centre.x + reach); px += 1) {
            if (px < 0 || py < 0 || px >= side || py >= side) {
                continue;
            }

            const distance = Math.hypot(px + 0.5 - centre.x, py + 0.5 - centre.y);

            if (distance > reach) {
                continue;
            }

            const weight = flow * (distance <= inner ? 1 : 1 - smoothstep(inner, reach, distance));
            const index = py * side + px;
            const value = ink[index] ?? 0;

            ink[index] =
                tool === 'brush'
                    ? value + (255 - value) * weight
                    : tool === 'erase'
                      ? value - value * weight
                      : value + (averageAround(before, side, px, py) - value) * weight;
        }
    }
};

export const spacingOf = (brush: Brush) => Math.max(0.5, brush.size / 6);

// Stamps into `ink` in place, unrounded, so a long run of segments copies and rounds once at its end.
export const strokeInto = (
    ink: number[],
    before: Frame,
    side: number,
    from: Point,
    to: Point,
    brush: Brush,
    symmetry: Symmetry,
    fromStamped = false,
) => {
    const length = Math.hypot((to.x - from.x) * side, (to.y - from.y) * side);
    const count = Math.max(1, Math.ceil(length / spacingOf(brush)));

    for (let step = fromStamped ? 1 : 0; step <= count; step += 1) {
        const along = step / count;
        const at = { x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along };

        for (const copy of copiesOf(at, symmetry)) {
            stamped(ink, before, side, { x: copy.x * side, y: copy.y * side }, brush);
        }
    }
};

export const rounded = (ink: readonly number[]): Frame =>
    ink.map(value => Math.round(clampInk(value)));

export const strokeOn = (
    frame: Frame,
    side: number,
    from: Point,
    to: Point,
    brush: Brush,
    symmetry: Symmetry,
): Frame => {
    const ink = [...frame];

    strokeInto(ink, frame, side, from, to, brush, symmetry);

    return rounded(ink);
};

export const guidesOf = (symmetry: Symmetry): readonly string[] => {
    const rays = (count: number) =>
        Array.from({ length: count }, (_, index) => {
            const angle = (index * TAU) / count - Math.PI / 2;

            return `M50 50 L${(50 + 70 * Math.cos(angle)).toFixed(2)} ${(50 + 70 * Math.sin(angle)).toFixed(2)}`;
        });

    switch (symmetry) {
        case 'none':
            return [];
        case 'mirror':
            return ['M50 0 V100'];
        case 'quad':
            return ['M50 0 V100', 'M0 50 H100'];
        case 'spin-3':
            return rays(3);
        case 'spin-6':
            return rays(6);
        case 'kaleido':
            return rays(12);
    }
};

// Markup, not an element: the guides drawn small, for a symmetry picker's buttons.
export const symmetryGlyph = (symmetry: Symmetry) =>
    `<svg viewBox="0 0 100 100" aria-hidden="true">${
        symmetry === 'none'
            ? '<circle cx="50" cy="50" r="7"/>'
            : guidesOf(symmetry)
                  .map(path => `<path d="${path}"/>`)
                  .join('')
    }<circle cx="50" cy="50" r="38" class="rim"/></svg>`;
