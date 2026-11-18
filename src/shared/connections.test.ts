import { describe, expect, it } from 'vitest';
import { tracePath, wirePath } from './connections.ts';

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

describe('tracePath', () => {
    const corners = (path: string) => (path.match(/Q/g) ?? []).length;
    const ends = (path: string) => [path.split(' L').at(-1), path.slice(0, path.indexOf(' L'))];

    it('runs right, across and right again into an input ahead, two soft corners', () => {
        const path = tracePath({ x: 0, y: 10 }, { x: 200, y: 90 });

        expect(corners(path)).toBe(2);
        expect(ends(path)).toEqual(['200 90', 'M0 10']);
        expect(path).toContain('Q100 10 100 18');
    });

    it('turns back under the boards when the input lies behind, four corners', () => {
        const path = tracePath({ x: 300, y: 50 }, { x: 100, y: 200 });

        expect(corners(path)).toBe(4);
        expect(path).toContain('Q316 50');
        expect(path).toContain('Q84 200');
    });

    it('drops below both ends when they share a row, rather than running along it', () => {
        const path = tracePath({ x: 300, y: 50 }, { x: 100, y: 60 });

        expect(path).toContain('Q316 108');
    });

    it('keeps a straight run straight', () => {
        expect(tracePath({ x: 0, y: 10 }, { x: 200, y: 10 })).toBe('M0 10 L100 10 L100 10 L200 10');
    });
});
