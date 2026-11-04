import { describe, expect, it } from 'vitest';
import { wirePath } from './connections.ts';

const controlsOf = (path: string) => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).slice(2, 6);

describe('wirePath', () => {
    it('pulls level out of both jacks when the target lies ahead', () => {
        expect(wirePath({ x: 0, y: 10 }, { x: 200, y: 50 })).toBe('M0 10 C100 10 100 50 200 50');
    });

    it('still leaves rightwards and arrives from the left when the target lies behind', () => {
        const [x1, y1, x2, y2] = controlsOf(wirePath({ x: 300, y: 10 }, { x: 0, y: 50 }));

        expect(x1).toBeGreaterThan(300);
        expect(y1).toBe(10);
        expect(x2).toBeLessThan(0);
        expect(y2).toBe(50);
        expect(x1).toBeLessThanOrEqual(460);
    });
});
