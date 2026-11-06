import { describe, expect, it } from 'vitest';
import {
    areaContains,
    areaOutline,
    boundsOf,
    connectedAreas,
    overlaps,
    subtractArea,
    unionArea,
} from './area.ts';
const square = { x: 0, y: 0, width: 100, height: 100 };
const size = (area: readonly { width: number; height: number }[]) =>
    area.reduce((sum, r) => sum + r.width * r.height, 0);

describe('workspace areas', () => {
    it('unites overlapping strokes without filling their bounding box', () => {
        const input = [square, { x: 50, y: 50, width: 100, height: 100 }];
        const area = unionArea(input);
        expect(size(area)).toBe(17500);
        expect(boundsOf(area)).toEqual({ x: 0, y: 0, width: 150, height: 150 });
        expect(areaContains(area, { x: 125, y: 25 })).toBe(false);
        expect(areaContains(area, { x: 75, y: 75 })).toBe(true);
        expect(area.every((a, i) => area.slice(i + 1).every(b => !overlaps(a, b)))).toBe(true);
        expect(size(unionArea([...area, ...area]))).toBe(17500);
    });
    it('subtracts holes and keeps their interior empty', () => {
        const area = subtractArea([square], {
            x: 25,
            y: 25,
            width: 50,
            height: 50,
        });
        expect(size(area)).toBe(7500);
        expect(connectedAreas(area)).toHaveLength(1);
        expect(areaContains(area, { x: 50, y: 50 })).toBe(false);
        expect(areaContains(area, { x: 10, y: 50 })).toBe(true);
        expect(areaOutline(area)).toContain('M25 25V75');
    });
    it('splits severed areas and deletes fully erased areas', () => {
        expect(
            connectedAreas(subtractArea([square], { x: 40, y: -10, width: 20, height: 120 })),
        ).toHaveLength(2);
        expect(subtractArea([square], square)).toEqual([]);
    });
    it('removes internal shared edges from the outline', () => {
        const path = areaOutline([
            { x: 0, y: 0, width: 50, height: 50 },
            { x: 50, y: 0, width: 50, height: 50 },
        ]);
        expect(path).not.toContain('M50 0V50');
    });
    it('preserves membership after mixed painting and erasing', () => {
        const paint = [
            square,
            { x: -20, y: 30, width: 200, height: 30 },
            { x: 40, y: -20, width: 20, height: 200 },
        ];
        const cuts = [
            { x: 25, y: 25, width: 50, height: 50 },
            { x: -40, y: 90, width: 90, height: 30 },
        ];
        const area = cuts.reduce(subtractArea, unionArea(paint));
        for (let x = -28.5; x < 190; x += 7)
            for (let y = -28.5; y < 190; y += 7) {
                const at = { x, y };
                expect(areaContains(area, at)).toBe(
                    areaContains(paint, at) && !areaContains(cuts, at),
                );
            }
    });
});
