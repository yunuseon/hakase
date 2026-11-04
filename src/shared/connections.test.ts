import { describe, expect, it } from 'vitest';
import { wirePath } from './connections.ts';

const controlsOf = (path: string) => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).slice(2, 6);

describe('wirePath', () => {
    it('pulls level out of both jacks when the target lies ahead', () => {
        expect(wirePath({ x: 0, y: 10 }, { x: 200, y: 50 })).toBe('M0 10 C100 10 100 50 200 50');
    });

    it('hangs below both jacks when the target lies behind, rather than looping past them', () => {
        const [x1, y1, x2, y2] = controlsOf(wirePath({ x: 300, y: 10 }, { x: 0, y: 50 }));

        expect(y1).toBeGreaterThan(50);
        expect(y2).toBeGreaterThan(50);
        expect(x1).toBeLessThanOrEqual(340);
        expect(x2).toBeGreaterThanOrEqual(-40);
    });
});
