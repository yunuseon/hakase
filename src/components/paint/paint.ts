import type { Logged } from '../../shared/logged.ts';
import { blank, MAX_FRAMES, type Frame, type Picture, type Side } from '../../shared/picture.ts';

export const TOOLS = ['brush', 'erase', 'soften', 'fill'] as const;
export type Tool = (typeof TOOLS)[number];
export const isTool = (value: string): value is Tool => TOOLS.some(tool => tool === value);

export const SYMMETRIES = ['none', 'mirror', 'quad', 'spin-3', 'spin-6', 'kaleido'] as const;
export type Symmetry = (typeof SYMMETRIES)[number];
export const isSymmetry = (value: string): value is Symmetry =>
    SYMMETRIES.some(symmetry => symmetry === value);

export const MAX_BRUSH = 24;

export type Brush = {
    readonly tool: Exclude<Tool, 'fill'>;
    readonly size: number;
    readonly hardness: number;
    readonly flow: number;
};

export type Point = { readonly x: number; readonly y: number };

export type PaintCommand =
    | {
          readonly kind: 'stroke';
          readonly frame: number;
          readonly from: Point;
          readonly to: Point;
          readonly brush: Brush;
          readonly symmetry: Symmetry;
          readonly start: boolean;
      }
    | {
          readonly kind: 'fill';
          readonly frame: number;
          readonly at: Point;
          readonly erase: boolean;
          readonly symmetry: Symmetry;
      }
    | { readonly kind: 'clear' | 'invert' | 'soften' | 'noise'; readonly frame: number }
    | { readonly kind: 'shift'; readonly frame: number; readonly dx: number; readonly dy: number }
    | { readonly kind: 'resize'; readonly side: Side }
    | { readonly kind: 'add-frame'; readonly after: number; readonly copy: boolean }
    | { readonly kind: 'remove-frame'; readonly index: number }
    | { readonly kind: 'fade'; readonly fade: boolean };

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

const smoothstep = (edge0: number, edge1: number, value: number) => {
    const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(edge1 - edge0, 1e-6)));

    return t * t * (3 - 2 * t);
};

const averageAround = (frame: Frame, side: number, px: number, py: number) => {
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

export const strokeOn = (
    frame: Frame,
    side: number,
    from: Point,
    to: Point,
    brush: Brush,
    symmetry: Symmetry,
): Frame => {
    const ink = [...frame];
    const length = Math.hypot((to.x - from.x) * side, (to.y - from.y) * side);
    const spacing = Math.max(0.5, brush.size / 6);
    const count = Math.max(1, Math.ceil(length / spacing));

    for (let step = 0; step <= count; step += 1) {
        const along = count === 0 ? 1 : step / count;
        const at = { x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along };

        for (const copy of copiesOf(at, symmetry)) {
            stamped(ink, frame, side, { x: copy.x * side, y: copy.y * side }, brush);
        }
    }

    return ink.map(value => Math.round(clampInk(value)));
};

const TOLERANCE = 40;

export const filledOn = (frame: Frame, side: number, at: Point, value: number): Frame => {
    const px = Math.floor(Math.max(0, Math.min(0.9999, at.x)) * side);
    const py = Math.floor(Math.max(0, Math.min(0.9999, at.y)) * side);
    const seed = frame[py * side + px] ?? 0;
    const ink = [...frame];
    const seen = new Set<number>();
    const queue = [py * side + px];

    while (queue.length > 0) {
        const index = queue.pop() ?? 0;

        if (seen.has(index) || Math.abs((frame[index] ?? 0) - seed) > TOLERANCE) {
            continue;
        }

        seen.add(index);
        ink[index] = value;
        const x = index % side;
        const y = Math.floor(index / side);

        [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
        ].forEach(([nx = -1, ny = -1]) => {
            if (nx >= 0 && ny >= 0 && nx < side && ny < side) {
                queue.push(ny * side + nx);
            }
        });
    }

    return ink;
};

const softened = (frame: Frame, side: number): Frame =>
    frame.map((_, index) =>
        Math.round(averageAround(frame, side, index % side, Math.floor(index / side))),
    );

const hashed = (seed: number, index: number) => {
    const x = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;

    return x - Math.floor(x);
};

const noisy = (side: number, seed: number): Frame => {
    const cells = Math.max(2, side / 8);
    const at = (gx: number, gy: number) =>
        hashed(seed, (((gy % cells) + cells) % cells) * cells + (((gx % cells) + cells) % cells));

    return Array.from({ length: side * side }, (_, index) => {
        const x = ((index % side) / side) * cells;
        const y = (Math.floor(index / side) / side) * cells;
        const gx = Math.floor(x);
        const gy = Math.floor(y);
        const fx = smoothstep(0, 1, x - gx);
        const fy = smoothstep(0, 1, y - gy);
        const top = at(gx, gy) + (at(gx + 1, gy) - at(gx, gy)) * fx;
        const bottom = at(gx, gy + 1) + (at(gx + 1, gy + 1) - at(gx, gy + 1)) * fx;

        return Math.round(255 * (top + (bottom - top) * fy));
    });
};

const shifted = (frame: Frame, side: number, dx: number, dy: number): Frame =>
    frame.map((_, index) => {
        const x = ((((index % side) - dx) % side) + side) % side;
        const y = (((Math.floor(index / side) - dy) % side) + side) % side;

        return frame[y * side + x] ?? 0;
    });

export const resampled = (frame: Frame, from: number, to: number): Frame =>
    Array.from({ length: to * to }, (_, index) => {
        const x = Math.min(from - 1, Math.max(0, (((index % to) + 0.5) * from) / to - 0.5));
        const y = Math.min(
            from - 1,
            Math.max(0, ((Math.floor(index / to) + 0.5) * from) / to - 0.5),
        );
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const x1 = Math.min(from - 1, x0 + 1);
        const y1 = Math.min(from - 1, y0 + 1);
        const read = (px: number, py: number) => frame[py * from + px] ?? 0;
        const top = read(x0, y0) + (read(x1, y0) - read(x0, y0)) * (x - x0);
        const bottom = read(x0, y1) + (read(x1, y1) - read(x0, y1)) * (x - x0);

        return Math.round(top + (bottom - top) * (y - y0));
    });

const withFrame = (picture: Picture, index: number, change: (frame: Frame) => Frame): Picture => {
    const frame = picture.frames[index];

    return frame === undefined
        ? picture
        : {
              ...picture,
              frames: picture.frames.map((each, at) => (at === index ? change(frame) : each)),
          };
};

export const reducePicture = (
    picture: Picture,
    command: PaintCommand,
    logged?: Logged,
): Picture => {
    const { side } = picture;

    switch (command.kind) {
        case 'stroke':
            return withFrame(picture, command.frame, frame =>
                strokeOn(frame, side, command.from, command.to, command.brush, command.symmetry),
            );
        case 'fill':
            return withFrame(picture, command.frame, frame =>
                copiesOf(command.at, command.symmetry).reduce(
                    (painted, at) => filledOn(painted, side, at, command.erase ? 0 : 255),
                    frame,
                ),
            );
        case 'clear':
            return withFrame(picture, command.frame, () => blank(side));
        case 'invert':
            return withFrame(picture, command.frame, frame => frame.map(ink => 255 - ink));
        case 'soften':
            return withFrame(picture, command.frame, frame => softened(frame, side));
        case 'noise':
            return withFrame(picture, command.frame, () =>
                noisy(side, logged?.seq ?? command.frame),
            );
        case 'shift':
            return withFrame(picture, command.frame, frame =>
                shifted(frame, side, Math.round(command.dx), Math.round(command.dy)),
            );
        case 'resize':
            return command.side === side
                ? picture
                : {
                      ...picture,
                      side: command.side,
                      frames: picture.frames.map(frame => resampled(frame, side, command.side)),
                  };
        case 'add-frame': {
            const source = picture.frames[command.after];

            return source === undefined || picture.frames.length >= MAX_FRAMES
                ? picture
                : {
                      ...picture,
                      frames: [
                          ...picture.frames.slice(0, command.after + 1),
                          command.copy ? source : blank(side),
                          ...picture.frames.slice(command.after + 1),
                      ],
                  };
        }
        case 'remove-frame':
            return picture.frames.length <= 1 || picture.frames[command.index] === undefined
                ? picture
                : {
                      ...picture,
                      frames: picture.frames.filter((_, index) => index !== command.index),
                  };
        case 'fade':
            return command.fade === picture.fade ? picture : { ...picture, fade: command.fade };
    }
};

export const ACTIONS = ['clear', 'invert', 'soften', 'noise'] as const;
export type Action = (typeof ACTIONS)[number];
export const isAction = (value: string): value is Action =>
    ACTIONS.some(action => action === value);

export const BRUSH_FIELDS = ['size', 'hardness', 'flow'] as const;
export type BrushField = (typeof BRUSH_FIELDS)[number];
export const isBrushField = (value: string): value is BrushField =>
    BRUSH_FIELDS.some(field => field === value);

export type PaintEvent =
    | { readonly kind: 'tool'; readonly tool: Tool }
    | { readonly kind: 'brush'; readonly field: BrushField; readonly value: number }
    | { readonly kind: 'grow'; readonly by: number }
    | { readonly kind: 'symmetry'; readonly symmetry: Symmetry }
    | { readonly kind: 'select'; readonly frame: number }
    | { readonly kind: 'step-frame'; readonly by: number }
    | { readonly kind: 'onion' }
    | { readonly kind: 'stroke'; readonly from: Point; readonly to: Point; readonly start: boolean }
    | { readonly kind: 'action'; readonly action: Action }
    | { readonly kind: 'shift'; readonly dx: number; readonly dy: number }
    | { readonly kind: 'side'; readonly side: Side }
    | { readonly kind: 'add-frame' }
    | { readonly kind: 'remove-frame' }
    | { readonly kind: 'fade' };

export type PaintView = {
    readonly picture: Picture;
    readonly tool: Tool;
    readonly size: number;
    readonly hardness: number;
    readonly flow: number;
    readonly symmetry: Symmetry;
    readonly frame: number;
    readonly onion: boolean;
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
