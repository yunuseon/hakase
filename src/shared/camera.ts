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

export const centredOn = (camera: Camera, rect: Rect, viewport: Extent): Camera => {
    const zoom = Math.min(camera.zoom, fitted([rect], viewport).zoom);

    return {
        zoom,
        x: viewport.width / 2 - (rect.x + rect.width / 2) * zoom,
        y: viewport.height / 2 - (rect.y + rect.height / 2) * zoom,
    };
};

export const zoomLabel = ({ zoom }: Camera): string => `${Math.round(zoom * 100)}%`;

export type Flight = {
    readonly duration: number;
    readonly at: (t: number) => Camera;
};

const RHO = 1.5;
const MS_PER_UNIT = 650;
const MIN_FLIGHT_MS = 600;
const MAX_FLIGHT_MS = 2600;

export const flight = (from: Camera, to: Camera, viewport: Extent): Flight => {
    const centre = centreOf(viewport);
    const start = worldAt(from, centre);
    const end = worldAt(to, centre);
    const w0 = viewport.width / from.zoom;
    const w1 = viewport.width / to.zoom;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const u1 = Math.hypot(dx, dy);

    const cameraAt = (x: number, y: number, width: number): Camera => {
        const zoom = clamp(viewport.width / width, MIN_ZOOM, MAX_ZOOM);

        return { zoom, x: centre.x - x * zoom, y: centre.y - y * zoom };
    };
    const duration = (s: number): number => clamp(s * MS_PER_UNIT, MIN_FLIGHT_MS, MAX_FLIGHT_MS);

    if (u1 < 1e-6) {
        const s = Math.abs(Math.log(w1 / w0)) / RHO;

        return {
            duration: duration(s),
            at: t => cameraAt(start.x, start.y, w0 * Math.pow(w1 / w0, t)),
        };
    }

    const rho2 = RHO * RHO;
    const b0 = (w1 * w1 - w0 * w0 + rho2 * rho2 * u1 * u1) / (2 * w0 * rho2 * u1);
    const b1 = (w1 * w1 - w0 * w0 - rho2 * rho2 * u1 * u1) / (2 * w1 * rho2 * u1);
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
    const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
    const length = (r1 - r0) / RHO;

    return {
        duration: duration(length),
        at: t => {
            const s = t * length;
            const u = (w0 / rho2) * (Math.cosh(r0) * Math.tanh(RHO * s + r0) - Math.sinh(r0));
            const width = (w0 * Math.cosh(r0)) / Math.cosh(RHO * s + r0);

            return cameraAt(start.x + (dx / u1) * u, start.y + (dy / u1) * u, width);
        },
    };
};
