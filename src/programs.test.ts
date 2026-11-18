import { describe, expect, it } from 'vitest';
import { sizeClassOf } from './layout/size-class.ts';
import { programList } from './programs.ts';

describe('the program table', () => {
    it('lets every window shrink to a glance and no further', () => {
        expect(
            programList
                .filter(({ minimum }) => sizeClassOf(minimum) !== 'glance')
                .map(({ id, minimum }) => `${id} ${minimum.width}x${minimum.height}`),
        ).toEqual([]);
    });
});
