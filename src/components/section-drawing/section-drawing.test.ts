import { describe, expect, it } from 'vitest';
import {
    drawingPoint,
    idleDrawing,
    reduceDrawing,
    rectangleBetween,
    worldRectangle,
} from './section-drawing.ts';

describe('section drawing', () => {
    it('normalises every drag direction', () => {
        for (const at of [
            { x: 90, y: 110 },
            { x: 10, y: 110 },
            { x: 90, y: 10 },
            { x: 10, y: 10 },
        ]) {
            const rect = rectangleBetween({ x: 50, y: 60 }, at);
            expect(rect).toEqual({
                x: Math.min(50, at.x),
                y: Math.min(60, at.y),
                width: 40,
                height: 50,
            });
        }
    });
    it('uses the release position and commits only a completed drag', () => {
        const ready = reduceDrawing(idleDrawing, { kind: 'start' });
        const grabbed = reduceDrawing(ready, {
            kind: 'grab',
            at: { x: 100, y: 100 },
        });
        const moved = reduceDrawing(grabbed, {
            kind: 'move',
            at: { x: 200, y: 200 },
        });
        expect(reduceDrawing(moved, { kind: 'release', at: { x: 250, y: 220 } })).toEqual({
            mode: 'done',
            tool: 'paint',
            rect: { x: 100, y: 100, width: 150, height: 120 },
        });
        expect(reduceDrawing(moved, { kind: 'cancel' })).toEqual(idleDrawing);
        expect(reduceDrawing(idleDrawing, { kind: 'release', at: { x: 250, y: 220 } })).toBe(
            idleDrawing,
        );
    });
    it('keeps an accidental tap armed', () => {
        const grabbed = reduceDrawing(
            { mode: 'ready', tool: 'paint' as const },
            { kind: 'grab', at: { x: 100, y: 100 } },
        );
        expect(reduceDrawing(grabbed, { kind: 'release', at: { x: 102, y: 101 } })).toEqual({
            mode: 'ready',
            tool: 'paint' as const,
        });
    });
    it('maps screen coordinates through pan and zoom', () => {
        expect(
            worldRectangle({ x: 100, y: 150, width: 400, height: 200 }, { x: -50, y: 50, zoom: 2 }),
        ).toEqual({ x: 75, y: 50, width: 200, height: 100 });
    });
});

it('reads drawing points within a scaled preview', () => {
    expect(
        drawingPoint(
            { x: 110, y: 140 },
            { x: 10, y: 40, width: 200, height: 100 },
            { width: 400, height: 200 },
        ),
    ).toEqual({ x: 200, y: 200 });
});
