import { expect, it } from 'vitest';
import { mergeSections, eraseSections } from './section-areas.ts';
import { areaContains } from './shared/area.ts';
const area = (id: string, x: number, width = 100) => ({
    id,
    name: id,
    rects: [{ x, y: 0, width, height: 100 }],
});
it('merges a bridge transitively and keeps the oldest name and identity', () => {
    const merged = mergeSections([area('old', 0), area('newer', 200), area('bridge', 90, 120)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'old', name: 'old' });
    expect(merged[0]?.rects).toEqual([{ x: 0, y: 0, width: 300, height: 100 }]);
});
it('joins edge neighbours but keeps corner neighbours separate', () => {
    expect(mergeSections([area('a', 0), area('b', 100)])).toHaveLength(1);
    expect(
        mergeSections([
            area('a', 0),
            {
                id: 'corner',
                name: 'corner',
                rects: [{ x: 100, y: 100, width: 100, height: 100 }],
            },
        ]),
    ).toHaveLength(2);
});
it('splits erased components with deterministic identities and preserves holes', () => {
    const split = eraseSections([area('old', 0)], { x: 40, y: -10, width: 20, height: 120 }, 42);
    expect(split.map(s => s.id)).toEqual(['old', 'old-part-42-1']);
    const hole = eraseSections([area('old', 0)], { x: 20, y: 20, width: 60, height: 60 }, 42);
    expect(hole).toHaveLength(1);
    expect(areaContains(hole[0]?.rects ?? [], { x: 50, y: 50 })).toBe(false);
});
