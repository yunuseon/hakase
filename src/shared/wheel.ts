import type { Point } from './camera.ts';

export type ViewGesture =
    | { readonly kind: 'pan'; readonly dx: number; readonly dy: number }
    | { readonly kind: 'zoom'; readonly factor: number; readonly at: Point };

export type WheelInput = {
    readonly deltaX: number;
    readonly deltaY: number;
    readonly lines: boolean;
    readonly pinch: boolean;
    readonly onGround: boolean;
    readonly at: Point;
};

const LINE = 16;
const ZOOM_RATE = 0.004;
const MAX_TICK = 50;

// null: a plain wheel over a window belongs to that window, so textareas still scroll.
export const wheelGesture = (input: WheelInput): ViewGesture | null => {
    const scale = input.lines ? LINE : 1;
    const dx = input.deltaX * scale;
    const dy = input.deltaY * scale;

    if (input.pinch) {
        const tick = Math.max(-MAX_TICK, Math.min(MAX_TICK, dy));

        return { kind: 'zoom', factor: Math.exp(-tick * ZOOM_RATE), at: input.at };
    }

    return input.onGround ? { kind: 'pan', dx: -dx, dy: -dy } : null;
};
