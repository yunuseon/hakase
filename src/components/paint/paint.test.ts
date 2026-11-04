import { describe, expect, it } from 'vitest';
import {
    blank,
    defaultPicture,
    frameAt,
    parsePicture,
    type Picture,
} from '../../shared/picture.ts';
import { copiesOf, reducePicture, resampled, type Brush } from './paint.ts';

const empty: Picture = { side: 16, frames: [blank(16)], fade: false };
const brush: Brush = { tool: 'brush', size: 3, hardness: 1, flow: 1 };
const inkAt = (picture: Picture, x: number, y: number, frame = 0) =>
    picture.frames[frame]?.[y * picture.side + x] ?? -1;
const total = (picture: Picture, frame = 0) =>
    (picture.frames[frame] ?? []).reduce((sum, ink) => sum + ink, 0);
const dot = (picture: Picture, x: number, y: number, symmetry: 'none' | 'quad' = 'none') =>
    reducePicture(picture, {
        kind: 'stroke',
        frame: 0,
        from: { x, y },
        to: { x, y },
        brush,
        symmetry,
        start: true,
    });

describe('painting', () => {
    it('places every copy of a mark, the mark itself first', () => {
        expect(copiesOf({ x: 0.25, y: 0.5 }, 'mirror')).toEqual([
            { x: 0.25, y: 0.5 },
            { x: 0.75, y: 0.5 },
        ]);
        expect(copiesOf({ x: 0.2, y: 0.3 }, 'quad')).toHaveLength(4);
        expect(copiesOf({ x: 0.2, y: 0.3 }, 'spin-6')).toHaveLength(6);
        expect(copiesOf({ x: 0.2, y: 0.3 }, 'kaleido')).toHaveLength(12);
        copiesOf({ x: 0.9, y: 0.5 }, 'spin-3').forEach(({ x, y }) =>
            expect(Math.hypot(x - 0.5, y - 0.5)).toBeCloseTo(0.4),
        );
    });

    it('inks a soft disc, mirrored by symmetry, and lays a stroke along its whole length', () => {
        const once = dot(empty, 0.25, 0.25);

        expect(inkAt(once, 4, 4)).toBe(255);
        expect(inkAt(once, 12, 12)).toBe(0);
        expect(inkAt(dot(empty, 0.25, 0.25, 'quad'), 12, 12)).toBe(255);

        const line = reducePicture(empty, {
            kind: 'stroke',
            frame: 0,
            from: { x: 0.1, y: 0.5 },
            to: { x: 0.9, y: 0.5 },
            brush,
            symmetry: 'none',
            start: true,
        });

        [2, 5, 8, 11, 14].forEach(x => expect(inkAt(line, x, 8)).toBeGreaterThan(200));
    });

    it('erases and softens with the same strokes', () => {
        const inked = dot(empty, 0.5, 0.5);
        const erased = reducePicture(inked, {
            kind: 'stroke',
            frame: 0,
            from: { x: 0.5, y: 0.5 },
            to: { x: 0.5, y: 0.5 },
            brush: { ...brush, tool: 'erase', size: 6 },
            symmetry: 'none',
            start: true,
        });
        const softened = reducePicture(inked, { kind: 'soften', frame: 0 });

        expect(total(erased)).toBe(0);
        expect(total(softened)).toBeGreaterThan(0);
        expect(inkAt(softened, 8, 8)).toBeLessThan(255);
    });

    it('floods a region of like ink, and nothing past its edge', () => {
        const walled = reducePicture(empty, {
            kind: 'stroke',
            frame: 0,
            from: { x: 0.5, y: 0 },
            to: { x: 0.5, y: 1 },
            brush,
            symmetry: 'none',
            start: true,
        });
        const filled = reducePicture(walled, {
            kind: 'fill',
            frame: 0,
            at: { x: 0.1, y: 0.5 },
            erase: false,
            symmetry: 'none',
        });

        expect(inkAt(filled, 1, 8)).toBe(255);
        expect(inkAt(filled, 14, 8)).toBe(0);
    });

    it('adds, copies and removes frames, never the last one, and plays them across the loop', () => {
        const inked = dot(empty, 0.5, 0.5);
        const two = reducePicture(inked, { kind: 'add-frame', after: 0, copy: true });
        const three = reducePicture(two, { kind: 'add-frame', after: 0, copy: false });

        expect(three.frames).toHaveLength(3);
        expect(total(three, 1)).toBe(0);
        expect(total(three, 2)).toBe(total(inked));
        expect(reducePicture(inked, { kind: 'remove-frame', index: 0 })).toBe(inked);
        expect(frameAt(three, 0.5)).toBeCloseTo(1.5);
        expect(frameAt(three, 1)).toBe(0);
    });

    it('draws the same noise on a replay, and resizes without losing the picture', () => {
        const once = reducePicture(empty, { kind: 'noise', frame: 0 }, { seq: 7 });
        const again = reducePicture(empty, { kind: 'noise', frame: 0 }, { seq: 7 });
        const other = reducePicture(empty, { kind: 'noise', frame: 0 }, { seq: 8 });

        expect(once).toEqual(again);
        expect(once).not.toEqual(other);
        expect(resampled([0, 255, 0, 255], 2, 4)).toHaveLength(16);
        expect(reducePicture(once, { kind: 'resize', side: 32 }).frames[0]).toHaveLength(1024);
    });

    it('shifts round the edges, inverts, and clears', () => {
        const inked = dot(empty, 0.05, 0.5);
        const shifted = reducePicture(inked, { kind: 'shift', frame: 0, dx: -2, dy: 0 });

        expect(inkAt(shifted, 15, 8)).toBe(255);
        expect(total(reducePicture(empty, { kind: 'invert', frame: 0 }))).toBe(255 * 256);
        expect(total(reducePicture(inked, { kind: 'clear', frame: 0 }))).toBe(0);
    });

    it('reads a saved picture back, and anything broken as the default', () => {
        const saved = parsePicture({ side: 16, frames: [blank(16), [1, 2]], fade: true });

        expect(saved.frames).toHaveLength(1);
        expect(saved.fade).toBe(true);
        expect(parsePicture({ side: 17, frames: [] })).toBe(defaultPicture);
        expect(parsePicture('nope')).toBe(defaultPicture);
    });
});
