import type { Viewport } from '../lib/dom.ts';
import { clamp } from '../lib/math.ts';
import { sketchParams } from './params.ts';

export type WindowId = 'terminal' | 'sketch' | 'timeline' | 'playhead';

export type Placement = {
    readonly x: number;
    readonly y: number;
    readonly z: number;
};

export type Frame = Placement & {
    readonly width: number;
    readonly height: number;
};

export type Layout = {
    readonly frames: Readonly<Record<WindowId, Frame>>;
    readonly order: readonly WindowId[];
};

export type ResizeEdge = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const RESIZE_EDGES: readonly ResizeEdge[] = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];

export type LayoutAction =
    | { readonly kind: 'move'; readonly id: WindowId; readonly dx: number; readonly dy: number }
    | {
          readonly kind: 'resize';
          readonly id: WindowId;
          readonly edge: ResizeEdge;
          readonly dx: number;
          readonly dy: number;
      }
    | { readonly kind: 'raise'; readonly id: WindowId };

export const WINDOW_IDS: readonly WindowId[] = ['terminal', 'sketch', 'timeline', 'playhead'];

const MIN_WIDTH = 180;
const MIN_HEIGHT = 64;
// The sketch's frame is its canvas size, so this caps the drawing buffer.
const MAX_SIDE = 1280;

export const defaultLayout = ({ width, height }: Viewport): Layout => {
    const gutter = 6;
    const terminalWidth = Math.min(360, Math.round(width * 0.26));
    const timelineHeight = 76;
    const dialSize = 200;

    const terminalHeight = height - timelineHeight - 3 * gutter;

    return {
        frames: {
            terminal: {
                x: gutter,
                y: gutter,
                width: terminalWidth,
                height: terminalHeight,
                z: 0,
            },
            // Never applied to the element: these are the canvas dimensions.
            sketch: {
                x: terminalWidth + 2 * gutter,
                y: gutter,
                width: sketchParams.width,
                height: sketchParams.height,
                z: 1,
            },
            timeline: {
                x: gutter,
                y: terminalHeight + 2 * gutter,
                width: terminalWidth,
                height: timelineHeight,
                z: 2,
            },
            playhead: {
                x: Math.max(gutter, width - dialSize - gutter),
                y: gutter,
                width: dialSize,
                height: dialSize + 44,
                z: 3,
            },
        },
        order: ['terminal', 'sketch', 'timeline', 'playhead'],
    };
};

const moved = (frame: Frame, dx: number, dy: number): Frame => ({
    ...frame,
    x: frame.x + dx,
    y: frame.y + dy,
});

// West and north shift `x`/`y` by the size the clamp allowed, not the raw delta.
const resized = (frame: Frame, edge: ResizeEdge, dx: number, dy: number): Frame => {
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

const raisedOrder = (order: readonly WindowId[], id: WindowId): readonly WindowId[] => [
    ...order.filter(other => other !== id),
    id,
];

const withOrder = (frames: Readonly<Record<WindowId, Frame>>, order: readonly WindowId[]) =>
    order.reduce<Record<WindowId, Frame>>(
        (all, id, index) => ({ ...all, [id]: { ...frames[id], z: index } }),
        { ...frames },
    );

export const reduceLayout = (layout: Layout, action: LayoutAction): Layout => {
    if (action.kind === 'raise') {
        const order = raisedOrder(layout.order, action.id);
        return { frames: withOrder(layout.frames, order), order };
    }

    const frame = layout.frames[action.id];
    const next =
        action.kind === 'move'
            ? moved(frame, action.dx, action.dy)
            : resized(frame, action.edge, action.dx, action.dy);

    return { ...layout, frames: { ...layout.frames, [action.id]: next } };
};

const REACHABLE = 80;

export const clampToViewport = (layout: Layout, viewport: Viewport): Layout => {
    const onScreen = (frame: Frame): Frame => ({
        ...frame,
        x: clamp(frame.x, REACHABLE - frame.width, viewport.width - REACHABLE),
        y: clamp(frame.y, 0, viewport.height - REACHABLE),
    });

    return {
        ...layout,
        frames: {
            terminal: onScreen(layout.frames.terminal),
            sketch: onScreen(layout.frames.sketch),
            timeline: onScreen(layout.frames.timeline),
            playhead: onScreen(layout.frames.playhead),
        },
    };
};

const finite = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const frameFrom = (value: unknown): Frame | null => {
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

export const parseLayout = (value: unknown): Layout | null => {
    if (typeof value !== 'object' || value === null || !('terminal' in value)) {
        return null;
    }

    if (!('sketch' in value && 'timeline' in value && 'playhead' in value)) {
        return null;
    }

    const terminal = frameFrom(value.terminal);
    const sketch = frameFrom(value.sketch);
    const timeline = frameFrom(value.timeline);
    const playhead = frameFrom(value.playhead);

    if (terminal === null || sketch === null || timeline === null || playhead === null) {
        return null;
    }

    const frames = { terminal, sketch, timeline, playhead };

    return { frames, order: [...WINDOW_IDS].sort((a, b) => frames[a].z - frames[b].z) };
};
