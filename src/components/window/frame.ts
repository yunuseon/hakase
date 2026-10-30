import { clamp } from '../../lib/math.ts';

export type Placement = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
};

export type Size = {
    readonly width: number;
    readonly height: number;
};

export type Frame = Placement & Size;

export const RESIZE_EDGES = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'] as const;

export type ResizeEdge = (typeof RESIZE_EDGES)[number];

export type WindowView = {
    // 'fitted' is sized by its content: the sketch's frame holds canvas dimensions.
    readonly kind: 'floating' | 'fitted';
    readonly frame: Frame;
    readonly focused: boolean;
};

// Untagged: a window does not know which program it holds, so whoever mounts it names that.
export type WindowGesture =
    | { readonly kind: 'move'; readonly dx: number; readonly dy: number }
    | {
          readonly kind: 'resize';
          readonly edge: ResizeEdge;
          readonly dx: number;
          readonly dy: number;
      }
    | { readonly kind: 'raise' }
    | { readonly kind: 'quit' }
    | { readonly kind: 'measure'; readonly width: number; readonly height: number };

const MIN_WIDTH = 180;
const MIN_HEIGHT = 64;
// The sketch's frame is its canvas size, so this caps the drawing buffer.
const MAX_SIDE = 1280;

export const moved = (frame: Frame, dx: number, dy: number): Frame => ({
    ...frame,
    x: frame.x + dx,
    y: frame.y + dy,
});

// West and north shift `x`/`y` by the size the clamp allowed, not the raw delta.
export const resized = (frame: Frame, edge: ResizeEdge, dx: number, dy: number): Frame => {
    const west = edge.includes('w');
    const north = edge.includes('n');

    const growX = edge.includes('e') ? dx : west ? -dx : 0;
    const growY = edge.includes('s') ? dy : north ? -dy : 0;

    const width = Math.round(clamp(frame.width + growX, MIN_WIDTH, MAX_SIDE));
    const height = Math.round(clamp(frame.height + growY, MIN_HEIGHT, MAX_SIDE));

    return {
        ...frame,
        x: west ? frame.x + (frame.width - width) : frame.x,
        y: north ? frame.y + (frame.height - height) : frame.y,
        width,
        height,
    };
};

const finite = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

export const frameFrom = (value: unknown): Frame | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    if (!('x' in value && 'y' in value && 'z' in value && 'width' in value && 'height' in value)) {
        return null;
    }

    const x = finite(value.x);
    const y = finite(value.y);
    const z = finite(value.z);
    const width = finite(value.width);
    const height = finite(value.height);

    if (x === null || y === null || z === null || width === null || height === null) {
        return null;
    }

    return { x, y, z, width, height };
};
