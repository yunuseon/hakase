import type { Point } from './camera.ts';
import type { ViewGesture } from './wheel.ts';

export type TouchInput =
    | { readonly kind: 'down'; readonly id: number; readonly at: Point; readonly pans: boolean }
    | { readonly kind: 'move'; readonly id: number; readonly at: Point }
    | { readonly kind: 'up'; readonly id: number };

type Touch = { readonly id: number; readonly at: Point; readonly pans: boolean };

export type Touches = {
    readonly touches: readonly Touch[];
    readonly gestures: readonly ViewGesture[];
};

export const NO_TOUCHES: Touches = { touches: [], gestures: [] };

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

const twoFingers = (
    before: readonly [Touch, Touch],
    after: readonly [Touch, Touch],
): readonly ViewGesture[] => {
    const from = midpoint(before[0].at, before[1].at);
    const to = midpoint(after[0].at, after[1].at);
    const apart = distance(before[0].at, before[1].at);
    const factor = apart === 0 ? 1 : distance(after[0].at, after[1].at) / apart;

    // Pan first, then zoom about where the fingers now are: the other order drifts.
    return [
        { kind: 'pan', dx: to.x - from.x, dy: to.y - from.y },
        { kind: 'zoom', factor, at: to },
    ];
};

const firstTwo = (touches: readonly Touch[]): readonly [Touch, Touch] | null => {
    const [a, b] = touches;

    return a === undefined || b === undefined ? null : [a, b];
};

export const reduceTouches = (state: Touches, input: TouchInput): Touches => {
    switch (input.kind) {
        case 'down':
            return {
                touches: [
                    ...state.touches.filter(touch => touch.id !== input.id),
                    { id: input.id, at: input.at, pans: input.pans },
                ],
                gestures: [],
            };
        case 'up':
            return {
                touches: state.touches.filter(touch => touch.id !== input.id),
                gestures: [],
            };
        case 'move': {
            const moved = state.touches.find(touch => touch.id === input.id);
            if (moved === undefined) {
                return { ...state, gestures: [] };
            }

            const touches = state.touches.map(touch =>
                touch.id === input.id ? { ...touch, at: input.at } : touch,
            );
            const before = firstTwo(state.touches);
            const after = firstTwo(touches);
            if (before !== null && after !== null) {
                const pinching = before.some(touch => touch.id === input.id);

                return { touches, gestures: pinching ? twoFingers(before, after) : [] };
            }

            return {
                touches,
                gestures: moved.pans
                    ? [{ kind: 'pan', dx: input.at.x - moved.at.x, dy: input.at.y - moved.at.y }]
                    : [],
            };
        }
    }
};
