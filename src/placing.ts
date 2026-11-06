import type { GhostView } from './components/placement/placement.ts';
import type { Size } from './components/window/frame.ts';
import type { Blueprint } from './blueprints.ts';
import { worldAt, type Camera, type Point, type Rect } from './shared/camera.ts';

// Dropped is a state, not a separate event: the drop reads its blueprint from the very fold that ends the mode.
export type Placing =
    | { readonly mode: 'idle' }
    | {
          readonly mode: 'placing';
          readonly blueprint: string | Blueprint;
          readonly at: Point;
      }
    | {
          readonly mode: 'dropped';
          readonly blueprint: string | Blueprint;
          readonly at: Point;
      };

export type PlacingAction =
    | {
          readonly kind: 'start';
          readonly blueprint: string | Blueprint;
          readonly at: Point;
      }
    | { readonly kind: 'move'; readonly at: Point }
    | { readonly kind: 'drop'; readonly at: Point }
    | { readonly kind: 'cancel' };

export const idle: Placing = { mode: 'idle' };

export const reducePlacing = (placing: Placing, action: PlacingAction): Placing => {
    switch (action.kind) {
        case 'start':
            return { mode: 'placing', blueprint: action.blueprint, at: action.at };
        case 'move':
            return placing.mode === 'placing' ? { ...placing, at: action.at } : placing;
        case 'drop':
            return placing.mode === 'placing'
                ? { mode: 'dropped', blueprint: placing.blueprint, at: action.at }
                : placing;
        case 'cancel':
            return placing.mode === 'idle' ? placing : idle;
    }
};

// The section centred under the pointer, in world units and whole, so a drop lands where the ghost was drawn.
export const footprintAt = ({ width, height }: Size, at: Point, camera: Camera): Rect => {
    const centre = worldAt(camera, at);

    return {
        x: Math.round(centre.x - width / 2),
        y: Math.round(centre.y - height / 2),
        width,
        height,
    };
};

const onScreen = (camera: Camera, { x, y, width, height }: Rect): Rect => ({
    x: x * camera.zoom + camera.x,
    y: y * camera.zoom + camera.y,
    width: width * camera.zoom,
    height: height * camera.zoom,
});

export const ghostOf = (
    { name, size, windows }: Pick<Blueprint, 'name' | 'size' | 'windows'>,
    at: Point,
    camera: Camera,
): GhostView => {
    const footprint = footprintAt(size, at, camera);

    return {
        name,
        section: onScreen(camera, footprint),
        windows: windows.map(({ frame }) =>
            onScreen(camera, {
                x: footprint.x + frame.x,
                y: footprint.y + frame.y,
                width: frame.width,
                height: frame.height,
            }),
        ),
    };
};
