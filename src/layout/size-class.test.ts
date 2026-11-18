import { describe, expect, it } from 'vitest';
import { bodyOf, sizeClassOf } from './size-class.ts';

describe('size classes', () => {
    it('reads the body a frame leaves, less the title strip and the padding', () => {
        expect(bodyOf({ width: 220, height: 180 })).toEqual({ width: 204, height: 136 });
    });

    it('sorts frames as the stylesheets do', () => {
        expect(sizeClassOf({ width: 220, height: 180 })).toBe('glance');
        expect(sizeClassOf({ width: 400, height: 150 })).toBe('glance');
        expect(sizeClassOf({ width: 300, height: 340 })).toBe('compact');
        expect(sizeClassOf({ width: 480, height: 620 })).toBe('regular');
        expect(sizeClassOf({ width: 920, height: 640 })).toBe('wide');
    });

    it('follows the root size: a larger root makes the same frame a smaller class', () => {
        expect(sizeClassOf({ width: 480, height: 620 }, 24)).toBe('compact');
    });
});
