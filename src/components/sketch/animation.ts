import type { Size } from '../../layout/frame.ts';
import { MAX_LEVEL } from '../../model/sketch/export.ts';

export const ZOOMS = ['in', 'out', 'fit'] as const;
export type Zoom = (typeof ZOOMS)[number];
export const isZoom = (value: string): value is Zoom => ZOOMS.some(zoom => zoom === value);

export type ZoomGesture =
    | { readonly kind: 'step'; readonly zoom: Zoom }
    // factor above 1 zooms in; x is where the fingers are, in track pixels.
    | { readonly kind: 'pinch'; readonly factor: number; readonly x: number };

export const TILE_HEIGHT = 54;

export type StripGeometry = {
    readonly frames: number;
    readonly level: number;
    readonly base: number;
    readonly frameWidth: number;
    readonly perTile: number;
    readonly tiles: number;
    readonly tileWidth: number;
    readonly tileHeight: number;
};

export const stripGeometry = (
    frames: number,
    level: number,
    { width, height }: Size,
): StripGeometry => {
    const base = Math.round(
        Math.min(Math.max((TILE_HEIGHT * width) / Math.max(height, 1), 36), 120),
    );
    const frameWidth = base / 2 ** level;
    const perTile = 2 ** Math.max(0, Math.ceil(level - 1e-9));

    return {
        frames,
        level,
        base,
        frameWidth,
        perTile,
        tiles: Math.ceil(frames / perTile),
        tileWidth: perTile * frameWidth,
        tileHeight: TILE_HEIGHT,
    };
};

const levelWithin = (level: number, frames: number): number =>
    Math.min(Math.max(level, 0), Math.min(MAX_LEVEL, Math.ceil(Math.log2(Math.max(frames, 1)))));

export type StripZoom = {
    readonly level: number;
    // Where to scroll once the new level is laid out, so the frame under the fingers stays under them.
    readonly left: number;
};

export const zoomedStrip = (
    gesture: ZoomGesture,
    { frames, level, base, frameWidth }: StripGeometry,
    { left, width }: Visible,
): StripZoom => {
    if (gesture.kind === 'step' && gesture.zoom === 'fit') {
        return {
            level: levelWithin(Math.log2((base * frames) / Math.max(width, 1)), frames),
            left: 0,
        };
    }

    const next = levelWithin(
        gesture.kind === 'pinch'
            ? level - Math.log2(gesture.factor)
            : level + (gesture.zoom === 'in' ? -1 : 1),
        frames,
    );
    const anchor = gesture.kind === 'pinch' ? gesture.x : left + width / 2;
    const scaled = (anchor / frameWidth) * (base / 2 ** next);

    return { level: next, left: Math.max(0, scaled - (anchor - left)) };
};

export const frameAt = (t: number, frames: number): number =>
    Math.min(frames - 1, Math.max(0, Math.floor(t * frames + 1e-6)));

export const frameAtX = (x: number, { frames, frameWidth }: StripGeometry): number =>
    Math.min(frames - 1, Math.max(0, Math.floor(x / frameWidth)));

export type Visible = { readonly left: number; readonly width: number };

export type TileRange = { readonly first: number; readonly last: number };

// One tile either side, so a short scroll shows a tile that is already painted.
export const tilesIn = (
    { left, width }: Visible,
    { tiles, tileWidth }: StripGeometry,
): TileRange => ({
    first: Math.max(0, Math.floor(left / tileWidth) - 1),
    last: Math.min(tiles - 1, Math.ceil((left + width) / tileWidth)),
});

export const sameRange = (a: TileRange, b: TileRange): boolean =>
    a.first === b.first && a.last === b.last;

export const followed = (x: number, { left, width }: Visible): number | null =>
    x < left || x > left + width - 8 ? Math.max(0, x - 8) : null;

export const markerX = (t: number, { frames, frameWidth }: StripGeometry): number =>
    t * frames * frameWidth;

// One value, not geometry beside a range derived from it: two paths into one combineLatest fire twice.
export type StripLayout = {
    readonly geometry: StripGeometry;
    readonly range: TileRange;
};

export const sameLayout = (a: StripLayout, b: StripLayout): boolean =>
    a.geometry === b.geometry && sameRange(a.range, b.range);

export type Box = Size & { readonly x: number; readonly y: number };

export const fitted = (slot: Size, { width, height }: Size): Box => {
    const aspect = width / Math.max(height, 1);
    const boxWidth = Math.round(Math.min(slot.width, slot.height * aspect));
    const boxHeight = Math.round(Math.min(slot.height, boxWidth / aspect));

    return {
        x: Math.round((slot.width - boxWidth) / 2),
        y: Math.round((slot.height - boxHeight) / 2),
        width: boxWidth,
        height: boxHeight,
    };
};

export const MAX_SUPERSAMPLE = 8;

// As fine as converges on the sketch, but never past what one GPU canvas can hold: a wide strip at 8x would.
export const supersampleFor = ({ width, height }: Size, limit: number): number =>
    Math.max(
        1,
        Math.min(
            MAX_SUPERSAMPLE,
            Math.floor(limit / Math.max(width, 1)),
            Math.floor(limit / Math.max(height, 1)),
        ),
    );
