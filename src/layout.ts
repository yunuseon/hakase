import {
    clampFrame,
    frameFrom,
    moved,
    resized,
    type Frame,
    type WindowGesture,
} from './components/window/frame.ts';
import type { Viewport } from './lib/dom.ts';
import { PROGRAM_IDS, type ProgramId } from './program.ts';
import { sketchParams } from './shared/params.ts';

export type Layout = {
    readonly frames: Readonly<Record<ProgramId, Frame>>;
    readonly order: readonly ProgramId[];
};

export type LayoutAction = WindowGesture & { readonly id: ProgramId };

export const defaultLayout = ({ width, height }: Viewport): Layout => {
    const gutter = 6;
    const editorWidth = Math.min(360, Math.round(width * 0.26));
    const timelineHeight = 108;
    const dialSize = 200;

    const editorHeight = height - timelineHeight - 3 * gutter;

    return {
        frames: {
            formula: {
                x: gutter,
                y: gutter,
                width: editorWidth,
                height: editorHeight,
                z: 0,
            },
            // Never applied to the element: these are the canvas dimensions.
            sketch: {
                x: editorWidth + 2 * gutter,
                y: gutter,
                width: sketchParams.width,
                height: sketchParams.height,
                z: 1,
            },
            timeline: {
                x: gutter,
                y: editorHeight + 2 * gutter,
                width: editorWidth,
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
        order: ['formula', 'sketch', 'timeline', 'playhead'],
    };
};

const raisedOrder = (order: readonly ProgramId[], id: ProgramId): readonly ProgramId[] => [
    ...order.filter(other => other !== id),
    id,
];

const withOrder = (frames: Readonly<Record<ProgramId, Frame>>, order: readonly ProgramId[]) =>
    order.reduce<Record<ProgramId, Frame>>(
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

export const clampToViewport = (layout: Layout, viewport: Viewport): Layout => ({
    ...layout,
    frames: {
        formula: clampFrame(layout.frames.formula, viewport),
        sketch: clampFrame(layout.frames.sketch, viewport),
        timeline: clampFrame(layout.frames.timeline, viewport),
        playhead: clampFrame(layout.frames.playhead, viewport),
    },
});

export const parseLayout = (value: unknown): Layout | null => {
    if (typeof value !== 'object' || value === null || !('formula' in value)) {
        return null;
    }

    if (!('sketch' in value && 'timeline' in value && 'playhead' in value)) {
        return null;
    }

    const formula = frameFrom(value.formula);
    const sketch = frameFrom(value.sketch);
    const timeline = frameFrom(value.timeline);
    const playhead = frameFrom(value.playhead);

    if (formula === null || sketch === null || timeline === null || playhead === null) {
        return null;
    }

    const frames = { formula, sketch, timeline, playhead };

    return { frames, order: [...PROGRAM_IDS].sort((a, b) => frames[a].z - frames[b].z) };
};
