import { boundsOf, sameArea, type Area } from '../../shared/area.ts';
import { worldAt, type Camera, type Extent, type Rect } from '../../shared/camera.ts';

export const ZOOM_COMMANDS = ['in', 'out', 'reset', 'fit'] as const;

export type ZoomCommand = (typeof ZOOM_COMMANDS)[number];

export const isZoomCommand = (value: string): value is ZoomCommand =>
    ZOOM_COMMANDS.some(command => command === value);

export const MINIMAP: Extent = { width: 328, height: 180 };

const PADDING = 0.08;

// Pixel rects inside MINIMAP, in the order given: the last one is the frontmost window.
export type Landmark = {
    readonly id: string;
    readonly name: string;
    readonly rects: Area;
};

export type MiniMap = {
    readonly windows: readonly Rect[];
    readonly sections: readonly Landmark[];
    readonly view: Rect;
};

export const minimapOf = (
    windows: readonly Rect[],
    sections: readonly Landmark[],
    camera: Camera,
    viewport: Extent,
): MiniMap => {
    const corner = worldAt(camera, { x: 0, y: 0 });
    const view: Rect = {
        ...corner,
        width: viewport.width / camera.zoom,
        height: viewport.height / camera.zoom,
    };
    const all = [...windows, ...sections.flatMap(({ rects }) => rects), view];

    const left = Math.min(...all.map(({ x }) => x));
    const top = Math.min(...all.map(({ y }) => y));
    const width = Math.max(...all.map(({ x, width }) => x + width)) - left;
    const height = Math.max(...all.map(({ y, height }) => y + height)) - top;

    const scale = (1 - 2 * PADDING) * Math.min(MINIMAP.width / width, MINIMAP.height / height);
    const offsetX = (MINIMAP.width - width * scale) / 2;
    const offsetY = (MINIMAP.height - height * scale) / 2;

    const atX = (x: number) => Math.round(offsetX + (x - left) * scale);
    const atY = (y: number) => Math.round(offsetY + (y - top) * scale);
    // Edges, not sizes, are rounded: two rects that share an edge must still share it here.
    const snapped = (rect: Rect): Rect => ({
        x: atX(rect.x),
        y: atY(rect.y),
        width: atX(rect.x + rect.width) - atX(rect.x),
        height: atY(rect.y + rect.height) - atY(rect.y),
    });
    const place = (rect: Rect): Rect => {
        const box = snapped(rect);
        return { ...box, width: Math.max(2, box.width), height: Math.max(2, box.height) };
    };

    return {
        windows: windows.map(place),
        sections: sections.map(section => {
            const rects = section.rects.map(snapped).filter(r => r.width > 0 && r.height > 0);
            return {
                ...section,
                rects: rects.length > 0 ? rects : [place(boundsOf(section.rects))],
            };
        }),
        view: place(view),
    };
};

const sameRect = (a: Rect, b: Rect): boolean =>
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

const sameLandmarks = (a: readonly Landmark[], b: readonly Landmark[]): boolean =>
    a.length === b.length &&
    a.every((landmark, index) => {
        const other = b[index];

        return (
            other !== undefined &&
            landmark.id === other.id &&
            landmark.name === other.name &&
            sameArea(landmark.rects, other.rects)
        );
    });

export const sameMiniMap = (a: MiniMap, b: MiniMap): boolean =>
    sameRect(a.view, b.view) &&
    sameLandmarks(a.sections, b.sections) &&
    a.windows.length === b.windows.length &&
    a.windows.every((rect, index) => {
        const other = b.windows[index];

        return other !== undefined && sameRect(rect, other);
    });
