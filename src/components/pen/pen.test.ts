import { describe, expect, it } from 'vitest';
import { defaultSignal, type Signal } from '../../shared/signal.ts';
import { DAB, dabCount, dabsAt, type Stroke } from '../../shared/stroke.ts';
import { defaultPen, drawingOf, parsePen, penAt, reducePen, strokeOf, type Pen } from './pen.ts';

const dabs = (stroke: Stroke) =>
    Array.from({ length: dabCount(stroke) }, (_, index) => ({
        x: stroke.dabs[index * DAB] ?? 0,
        y: stroke.dabs[index * DAB + 1] ?? 0,
        radius: stroke.dabs[index * DAB + 2] ?? 0,
        flow: stroke.dabs[index * DAB + 3] ?? 0,
        at: stroke.dabs[index * DAB + 4] ?? 0,
    }));
const whole: Pen = { ...defaultPen, mode: 'whole' };

describe('the pen', () => {
    it('goes round in a circle while nothing steers it', () => {
        const drawing = drawingOf(whole, new Map());

        expect(penAt(drawing, 0)).toEqual({ x: 0.85, y: 0.5 });
        expect(penAt(drawing, 0.25).y).toBeCloseTo(0.15);

        const laid = dabs(strokeOf(drawing));

        expect(laid.length).toBeGreaterThan(100);
        laid.forEach(({ x, y }) => {
            expect(Math.hypot(x - 0.5, y - 0.5)).toBeCloseTo(0.35, 2);
        });
    });

    it('lays its dabs in loop order, so a drawn stroke shows exactly the part the playhead has reached', () => {
        const stroke = strokeOf(drawingOf({ ...defaultPen, mode: 'draw' }, new Map()));
        const laid = dabs(stroke);

        laid.slice(1).forEach(({ at }, index) => {
            expect(at).toBeGreaterThanOrEqual(laid[index]?.at ?? 0);
        });
        expect(dabsAt(stroke, 0.5)).toBe(laid.filter(({ at }) => at <= 0.5).length);
        expect(dabsAt(stroke, 0)).toBeLessThan(5);
        expect(dabsAt(strokeOf(drawingOf(whole, new Map())), 0)).toBe(laid.length);
    });

    it('follows the signals plugged into it, lifts where the ink runs out, and lays copies by symmetry', () => {
        const right: Signal = { ...defaultSignal, offset: 0.8, depth: 0 };
        const high: Signal = { ...defaultSignal, offset: 0.9, depth: 0 };
        const dry: Signal = { ...defaultSignal, offset: 0, depth: 0 };
        const signals = new Map([
            ['right', right],
            ['high', high],
            ['dry', dry],
        ]);
        const steered = { ...whole, sources: { x: 'right', y: 'high', size: null, ink: null } };
        const drawing = drawingOf(steered, signals);

        expect(penAt(drawing, 0.3).x).toBeCloseTo(0.8);
        expect(penAt(drawing, 0.3).y).toBeCloseTo(0.1);

        const mirrored = dabs(strokeOf(drawingOf({ ...steered, symmetry: 'mirror' }, signals)));

        expect(mirrored.map(({ x }) => x.toFixed(3))).toEqual(['0.800', '0.200']);
        expect(
            dabCount(
                strokeOf(
                    drawingOf(
                        { ...defaultPen, sources: { x: null, y: null, size: null, ink: 'dry' } },
                        signals,
                    ),
                ),
            ),
        ).toBe(0);
    });

    it('swells with the size signal, in sixty-fourths of the square', () => {
        const half: Signal = { ...defaultSignal, offset: 0.5, depth: 0 };
        const drawing = drawingOf(
            { ...whole, weight: 4, sources: { x: null, y: null, size: 'half', ink: null } },
            new Map([['half', half]]),
        );

        expect(dabs(strokeOf(drawing))[0]?.radius).toBeCloseTo((4 * 0.5) / 64 / 2);
    });

    it('keeps its settings in range, and reads a broken save as the default, field by field', () => {
        expect(reducePen(defaultPen, { kind: 'weight', weight: 99 }).weight).toBe(12);
        expect(reducePen(defaultPen, { kind: 'mode', mode: 'draw' })).toBe(defaultPen);
        expect(
            parsePen({ side: 16, weight: 'heavy', mode: 'whole', sources: { x: 'a', y: 3 } }),
        ).toEqual({
            ...defaultPen,
            mode: 'whole',
            sources: { x: 'a', y: null, size: null, ink: null },
        });
    });
});
