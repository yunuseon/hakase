import { describe, expect, it } from 'vitest';
import { frameFrom, MINIMUM, resized } from './frame.ts';

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
