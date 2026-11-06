import { worldAt, type Camera, type Point, type Rect, type Extent } from '../../shared/camera.ts';

export const TOOLS = ['paint', 'erase', 'select'] as const;
export type DrawingTool = (typeof TOOLS)[number];

export type Drawing =
    | { readonly mode: 'idle' }
    | { readonly mode: 'ready'; readonly tool: DrawingTool }
    | {
          readonly mode: 'drawing';
          readonly tool: DrawingTool;
          readonly start: Point;
          readonly at: Point;
      }
    | { readonly mode: 'done'; readonly tool: DrawingTool; readonly rect: Rect };

export type DrawingAction =
    | { readonly kind: 'start'; readonly tool?: DrawingTool }
    | { readonly kind: 'cancel' }
    | { readonly kind: 'grab' | 'move' | 'release'; readonly at: Point };

export const idleDrawing: Drawing = { mode: 'idle' };

export const rectangleBetween = (start: Point, at: Point): Rect => ({
    x: Math.min(start.x, at.x),
    y: Math.min(start.y, at.y),
    width: Math.abs(at.x - start.x),
    height: Math.abs(at.y - start.y),
});

export const worldRectangle = (rect: Rect, camera: Camera): Rect => ({
    ...worldAt(camera, rect),
    width: rect.width / camera.zoom,
    height: rect.height / camera.zoom,
});

export const reduceDrawing = (drawing: Drawing, action: DrawingAction): Drawing => {
    switch (action.kind) {
        case 'start':
            return { mode: 'ready', tool: action.tool ?? 'paint' };
        case 'cancel':
            return idleDrawing;
        case 'grab':
            return drawing.mode === 'ready'
                ? {
                      mode: 'drawing',
                      tool: drawing.tool,
                      start: action.at,
                      at: action.at,
                  }
                : drawing;
        case 'move':
            return drawing.mode === 'drawing' ? { ...drawing, at: action.at } : drawing;
        case 'release': {
            if (drawing.mode !== 'drawing') return drawing;
            const rect = rectangleBetween(drawing.start, action.at);
            return rect.width < 4 || rect.height < 4
                ? { mode: 'ready', tool: drawing.tool }
                : { mode: 'done', tool: drawing.tool, rect };
        }
    }
};

export const drawingPoint = (at: Point, bounds: Rect, size: Extent): Point => ({
    x: (at.x - bounds.x) * (bounds.width === 0 ? 1 : size.width / bounds.width),
    y: (at.y - bounds.y) * (bounds.height === 0 ? 1 : size.height / bounds.height),
});
