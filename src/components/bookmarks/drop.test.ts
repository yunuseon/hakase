import { describe, expect, it } from 'vitest';
import { dropTarget } from './drop.ts';

describe('dropTarget', () => {
    const shelves = [
        { id: 'one', top: 0, bottom: 100, middles: [20, 50] },
        { id: 'two', top: 120, bottom: 200, middles: [] },
    ];

    it('picks the group under the pointer, or the nearest, and counts what is above', () => {
        expect(dropTarget(40, shelves)).toEqual({ group: 'one', to: 1 });
        expect(dropTarget(150, shelves)).toEqual({ group: 'two', to: 0 });
        expect(dropTarget(-30, shelves)).toEqual({ group: 'one', to: 0 });
        expect(dropTarget(0, [])).toBeNull();
    });
});
