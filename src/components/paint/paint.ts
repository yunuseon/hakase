import type { Logged } from '../../shared/logged.ts';
import { blank, MAX_FRAMES, type Frame, type Picture, type Side } from '../../shared/picture.ts';
import {
    averageAround,
    copiesOf,
    INKS,
    smoothstep,
    strokeOn,
    type Brush,
    type Point,
    type Symmetry,
} from '../../shared/brush.ts';

export const TOOLS = [...INKS, 'fill'] as const;
export type Tool = (typeof TOOLS)[number];
export const isTool = (value: string): value is Tool => TOOLS.some(tool => tool === value);

export const MAX_BRUSH = 24;

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
