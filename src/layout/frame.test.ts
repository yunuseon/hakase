import { describe, expect, it } from 'vitest';
import { frameFrom, MINIMUM, opensAbove, resized, tooSmall } from './frame.ts';

const frame = { x: 100, y: 100, z: 0, width: 300, height: 200 };

describe('resizing a window', () => {
    it('grows east and south in place', () => {
        expect(resized(frame, 'se', 40, 20)).toMatchObject({
            x: 100,
            y: 100,
            width: 340,
            height: 220,
        });
    });

    it('moves west and north by what the minimum allowed, so the far edge stays put', () => {
        const pushed = resized(frame, 'nw', 500, 500);

        expect(pushed).toMatchObject({ width: MINIMUM.width, height: MINIMUM.height });
        expect(pushed.x + pushed.width).toBe(frame.x + frame.width);
        expect(pushed.y + pushed.height).toBe(frame.y + frame.height);
    });

    it("clamps to the program's own minimum, not the global one", () => {
        expect(resized(frame, 'e', -1000, 0, { width: 320, height: 420 }).width).toBe(320);
    });
});

describe('a saved frame', () => {
    it('is read field by field and refused when a field is not a finite number', () => {
        expect(frameFrom(frame)).toEqual(frame);
        expect(frameFrom({ ...frame, width: Number.NaN })).toBeNull();
        expect(frameFrom({ x: 1, y: 2 })).toBeNull();
    });
});

describe('reading distance', () => {
    it('calls a window too small to read below three quarters of its laid-out size', () => {
        expect(tooSmall(123, 300)).toBe(true);
        expect(tooSmall(240, 300)).toBe(false);
        expect(tooSmall(600, 300)).toBe(false);
        expect(tooSmall(0, 0)).toBe(false);
    });
});

describe('opensAbove', () => {
    const viewport = { top: 0, height: 600 };

    it('opens below while it fits', () => {
        expect(opensAbove({ top: 100, bottom: 400 }, { top: 60 }, viewport)).toBe(false);
    });

    it('opens above when it runs off the bottom and there is more room above', () => {
        expect(opensAbove({ top: 500, bottom: 800 }, { top: 460 }, viewport)).toBe(true);
    });

    it('stays below when there is even less room above', () => {
        expect(opensAbove({ top: 120, bottom: 700 }, { top: 80 }, viewport)).toBe(false);
    });
});
