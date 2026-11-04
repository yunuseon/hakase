import { describe, expect, it } from 'vitest';
import { linkPath } from './links.ts';

const box = (x: number, y: number) => ({ x, y, width: 100, height: 50 });

describe('linkPath', () => {
    it('leaves the facing side for windows side by side', () => {
        expect(linkPath(box(0, 0), box(300, 20))).toMatch(/^M100 25 .* 300 45$/);
        expect(linkPath(box(300, 0), box(0, 0))).toMatch(/^M300 25 .* 100 25$/);
    });

    it('leaves the bottom or top for windows above one another', () => {
        expect(linkPath(box(0, 0), box(10, 300))).toMatch(/^M50 50 .* 60 300$/);
        expect(linkPath(box(0, 300), box(0, 0))).toMatch(/^M50 300 .* 50 50$/);
    });
});
