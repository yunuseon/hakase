import { describe, expect, it } from 'vitest';
import {
    exportFrames,
    exportPixels,
    fitted,
    frameAt,
    frameAtX,
    MAX_SUPERSAMPLE,
    markerX,
    stripGeometry,
    supersampleFor,
    tilesIn,
    zoomedStrip,
} from './animation.ts';

const square = { width: 640, height: 640 };

describe('stripGeometry', () => {
    it('shows one frame per tile at level 0', () => {
        const geometry = stripGeometry(240, 0, square);

        expect(geometry).toMatchObject({ perTile: 1, tiles: 240, tileWidth: geometry.base });
    });

    it('widens tiles between whole levels instead of splitting them', () => {
        const whole = stripGeometry(240, 1, square);
        const between = stripGeometry(240, 1.5, square);

        expect(between.perTile).toBe(4);
        expect(between.tileWidth).toBeGreaterThan(whole.tileWidth);
        expect(between.tileWidth).toBeLessThan(2 * whole.tileWidth);
    });

    it('takes the tile shape from the sketch, within limits', () => {
        expect(stripGeometry(10, 0, { width: 1000, height: 100 }).base).toBe(120);
        expect(stripGeometry(10, 0, { width: 100, height: 1000 }).base).toBe(36);
    });
});

describe('zoomedStrip', () => {
    const geometry = stripGeometry(240, 2, square);
    const visible = { left: 300, width: 500 };

    it('keeps the frame under the fingers in place', () => {
        const x = 520;
        const { level, left } = zoomedStrip({ kind: 'pinch', factor: 2, x }, geometry, visible);
        const after = stripGeometry(240, level, square);

        expect(level).toBeCloseTo(1);
        expect(frameAtX(left + (x - visible.left), after)).toBe(frameAtX(x, geometry));
    });

    it('never zooms in past one frame per tile or out past the whole loop', () => {
        expect(zoomedStrip({ kind: 'pinch', factor: 1e6, x: 0 }, geometry, visible).level).toBe(0);
        expect(zoomedStrip({ kind: 'pinch', factor: 1e-6, x: 0 }, geometry, visible).level).toBe(
            Math.ceil(Math.log2(240)),
        );
    });

    it('fits the whole loop into the visible width', () => {
        const { level, left } = zoomedStrip({ kind: 'step', zoom: 'fit' }, geometry, visible);
        const fit = stripGeometry(240, level, square);

        expect(left).toBe(0);
        expect(240 * fit.frameWidth).toBeCloseTo(visible.width);
    });
});

describe('frames and the marker', () => {
    const geometry = stripGeometry(240, 0, square);

    it('maps time to a frame without rounding past the last one', () => {
        expect(frameAt(0, 240)).toBe(0);
        expect(frameAt(0.1, 240)).toBe(24);
        expect(frameAt(0.9999, 240)).toBe(239);
    });

    it('puts the marker where the frame it shows starts', () => {
        expect(frameAtX(markerX(0.1, geometry), geometry)).toBe(24);
    });

    it('renders only the tiles in view, plus one either side', () => {
        const range = tilesIn(
            { left: geometry.tileWidth * 10, width: geometry.tileWidth * 5 },
            geometry,
        );

        expect(range).toEqual({ first: 9, last: 15 });
    });
});

describe('export', () => {
    it('keeps the aspect and rounds both sides to even', () => {
        expect(exportPixels({ width: 670, height: 542 }, 1080)).toEqual({
            width: 1080,
            height: 874,
        });
        expect(exportPixels({ width: 333, height: 1000 }, 480)).toEqual({
            width: 160,
            height: 480,
        });
    });

    it('plays a warm-up loop before the kept frames when trails need one', () => {
        const frames = exportFrames(4, true);

        expect(frames.map(({ index }) => index)).toEqual([null, null, null, null, 0, 1, 2, 3]);
        expect(frames[4]?.t).toBe(0);
    });
});

describe('thumbnails', () => {
    it('fits the sketch into a tile, centred', () => {
        expect(fitted({ width: 200, height: 100 }, { width: 640, height: 640 })).toEqual({
            x: 50,
            y: 0,
            width: 100,
            height: 100,
        });
    });

    it('supersamples as far as one canvas allows', () => {
        expect(supersampleFor({ width: 1000, height: 100 }, 16384)).toBe(MAX_SUPERSAMPLE);
        expect(supersampleFor({ width: 4000, height: 100 }, 16384)).toBe(4);
        expect(supersampleFor({ width: 40000, height: 100 }, 16384)).toBe(1);
    });
});
