import { describe, expect, it } from 'vitest';
import { areaOutline } from '../../shared/area.ts';
import { minimapOf } from './navigator.ts';

const camera = { x: 0, y: 0, zoom: 1 };

describe('minimapOf', () => {
    it('keeps rects that share an edge sharing it after scaling', () => {
        const rects = [
            { x: 293, y: 29, width: 637, height: 431 },
            { x: 66, y: 305, width: 227, height: 155 },
            { x: 66, y: 460, width: 396, height: 191 },
        ];
        const [section] = minimapOf([], [{ id: 'a', name: 'A', rects }], camera, {
            width: 3000,
            height: 1700,
        }).sections;
        const placed = section?.rects ?? [];
        expect(placed).toHaveLength(3);
        const [top, left, bottom] = placed;
        expect(left && top && left.x + left.width).toBe(top?.x);
        expect(top && bottom && top.y + top.height).toBe(bottom?.y);
        expect(left && bottom && left.y + left.height).toBe(bottom?.y);
        expect(areaOutline(placed)).not.toContain(`M${bottom?.x} ${bottom?.y}H`);
    });

    it('keeps a section too small to round to a pixel', () => {
        const [section] = minimapOf(
            [{ x: 0, y: 0, width: 100000, height: 50000 }],
            [{ id: 'a', name: 'A', rects: [{ x: 10, y: 10, width: 5, height: 5 }] }],
            camera,
            { width: 100, height: 100 },
        ).sections;
        expect(section?.rects).toHaveLength(1);
        expect(section?.rects[0]?.width).toBe(2);
    });
});
