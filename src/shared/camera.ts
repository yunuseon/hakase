import { clamp } from '../lib/math.ts';

export type Point = {
    readonly x: number;
    readonly y: number;
};

export type Rect = Point & {
    readonly width: number;
    readonly height: number;
};

export type Extent = {
    readonly width: number;
    readonly height: number;
};

export type Camera = Point & {
    readonly zoom: number;
};

export const IDENTITY: Camera = { x: 0, y: 0, zoom: 1 };

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 1.25;

const FIT_MARGIN = 64;

export const panned = (camera: Camera, dx: number, dy: number): Camera => ({
    ...camera,
    x: camera.x + dx,
    y: camera.y + dy,
});

export const worldAt = (camera: Camera, screen: Point): Point => ({
    x: (screen.x - camera.x) / camera.zoom,
    y: (screen.y - camera.y) / camera.zoom,
});

export const zoomedTo = (camera: Camera, zoom: number, screen: Point): Camera => {
    const next = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    const anchor = worldAt(camera, screen);

    return { zoom: next, x: screen.x - anchor.x * next, y: screen.y - anchor.y * next };
};

export const zoomedAround = (camera: Camera, factor: number, screen: Point): Camera =>
    zoomedTo(camera, camera.zoom * factor, screen);

export const centreOf = ({ width, height }: Extent): Point => ({ x: width / 2, y: height / 2 });

export const fitted = (rects: readonly Rect[], viewport: Extent): Camera => {
    if (rects.length === 0) {
        return IDENTITY;
    }

    const left = Math.min(...rects.map(({ x }) => x));
    const top = Math.min(...rects.map(({ y }) => y));
    const right = Math.max(...rects.map(({ x, width }) => x + width));
    const bottom = Math.max(...rects.map(({ y, height }) => y + height));

    const zoom = clamp(
        Math.min(
            (viewport.width - 2 * FIT_MARGIN) / Math.max(right - left, 1),
            (viewport.height - 2 * FIT_MARGIN) / Math.max(bottom - top, 1),
        ),
        MIN_ZOOM,
        1,
    );

    return {
        zoom,
        x: viewport.width / 2 - ((left + right) / 2) * zoom,
        y: viewport.height / 2 - ((top + bottom) / 2) * zoom,
    };
};

export const zoomLabel = ({ zoom }: Camera): string => `${Math.round(zoom * 100)}%`;
