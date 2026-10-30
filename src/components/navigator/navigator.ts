import { worldAt, type Camera, type Extent, type Rect } from '../../shared/camera.ts';

export const ZOOM_COMMANDS = ['in', 'out', 'reset', 'fit'] as const;

export type ZoomCommand = (typeof ZOOM_COMMANDS)[number];

export const isZoomCommand = (value: string): value is ZoomCommand =>
    ZOOM_COMMANDS.some(command => command === value);

export const MINIMAP: Extent = { width: 216, height: 120 };

const PADDING = 0.08;

// Pixel rects inside MINIMAP, in the order given: the last one is the frontmost window.
export type MiniMap = {
    readonly windows: readonly Rect[];
    readonly view: Rect;
};

export const minimapOf = (windows: readonly Rect[], camera: Camera, viewport: Extent): MiniMap => {
    const corner = worldAt(camera, { x: 0, y: 0 });
    const view: Rect = {
        ...corner,
        width: viewport.width / camera.zoom,
        height: viewport.height / camera.zoom,
    };
    const all = [...windows, view];

    const left = Math.min(...all.map(({ x }) => x));
    const top = Math.min(...all.map(({ y }) => y));
    const width = Math.max(...all.map(({ x, width }) => x + width)) - left;
    const height = Math.max(...all.map(({ y, height }) => y + height)) - top;

    const scale = (1 - 2 * PADDING) * Math.min(MINIMAP.width / width, MINIMAP.height / height);
    const offsetX = (MINIMAP.width - width * scale) / 2;
    const offsetY = (MINIMAP.height - height * scale) / 2;

    const place = (rect: Rect): Rect => ({
        x: Math.round(offsetX + (rect.x - left) * scale),
        y: Math.round(offsetY + (rect.y - top) * scale),
        width: Math.max(2, Math.round(rect.width * scale)),
        height: Math.max(2, Math.round(rect.height * scale)),
    });

    return { windows: windows.map(place), view: place(view) };
};

const sameRect = (a: Rect, b: Rect): boolean =>
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

export const sameMiniMap = (a: MiniMap, b: MiniMap): boolean =>
    sameRect(a.view, b.view) &&
    a.windows.length === b.windows.length &&
    a.windows.every((rect, index) => {
        const other = b.windows[index];

        return other !== undefined && sameRect(rect, other);
    });
