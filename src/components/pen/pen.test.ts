import { describe, expect, it } from 'vitest';
import { defaultSignal, type Signal } from '../../shared/signal.ts';
import {
    DRAW_FRAMES,
    defaultPen,
    drawingOf,
    parsePen,
    penAt,
    reducePen,
    traced,
    type Pen,
} from './pen.ts';

const inked = (frame: readonly number[]) => frame.filter(ink => ink > 0).length;
const whole: Pen = { ...defaultPen, side: 32, mode: 'whole' };

describe('the pen', () => {
    it('goes round in a circle while nothing steers it', () => {
        const drawing = drawingOf(whole, new Map());

        expect(penAt(drawing, 0)).toEqual({ x: 0.85, y: 0.5 });
        expect(penAt(drawing, 0.25).y).toBeCloseTo(0.15);

        const [frame = []] = traced(drawing).frames;
        const centre = 16 * 32 + 16;

        expect(inked(frame)).toBeGreaterThan(80);
        expect(frame[centre]).toBe(0);
    });

    it('draws its line across the loop, a frame for each part of it', () => {
        const picture = traced(drawingOf({ ...whole, mode: 'draw' }, new Map()));
        const counts = picture.frames.map(inked);

        expect(picture.frames).toHaveLength(DRAW_FRAMES);
        expect(picture.fade).toBe(true);
        counts.slice(1).forEach((count, index) => {
            expect(count).toBeGreaterThanOrEqual(counts[index] ?? 0);
        });
        expect(counts[0]).toBeLessThan(counts.at(-1) ?? 0);
    });

    it('follows the signals plugged into x and y, and lays copies by symmetry', () => {
        const right: Signal = { ...defaultSignal, offset: 0.8, depth: 0 };
        const high: Signal = { ...defaultSignal, offset: 0.9, depth: 0 };
        const signals = new Map([
            ['right', right],
            ['high', high],
        ]);
        const steered = { ...whole, sources: { x: 'right', y: 'high', size: null, ink: null } };
        const drawing = drawingOf(steered, signals);

        expect(penAt(drawing, 0.3).x).toBeCloseTo(0.8);
        expect(penAt(drawing, 0.3).y).toBeCloseTo(0.1);

        const mirrored = traced(drawingOf({ ...steered, symmetry: 'mirror' }, signals));
        const row = Math.floor(0.1 * 32) * 32;

        expect(mirrored.frames[0]?.[row + Math.floor(0.8 * 32)]).toBeGreaterThan(0);
        expect(mirrored.frames[0]?.[row + Math.floor(0.2 * 32)]).toBeGreaterThan(0);
    });

    it('keeps its settings in range, and reads a broken save as the default, field by field', () => {
        expect(reducePen(defaultPen, { kind: 'weight', weight: 99 }).weight).toBe(12);
        expect(reducePen(defaultPen, { kind: 'side', side: 64 })).toBe(defaultPen);
        expect(
            parsePen({ side: 16, weight: 'heavy', mode: 'whole', sources: { x: 'a', y: 3 } }),
        ).toEqual({
            ...defaultPen,
            side: 16,
            mode: 'whole',
            sources: { x: 'a', y: null, size: null, ink: null },
        });
    });
});
