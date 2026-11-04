import { describe, expect, it } from 'vitest';
import { parseTarget, targetId } from './inventory.ts';

describe('targets', () => {
    it('round-trip through their ids, store ids with colons included', () => {
        const target = { kind: 'store' as const, program: 'bookmarks' as const, store: 'odd:id' };

        expect(parseTarget(targetId(target))).toEqual(target);
        expect(parseTarget('global:library')).toEqual({ kind: 'global', name: 'library' });
        expect(parseTarget('global:nope')).toBeNull();
        expect(parseTarget('store:nope:x')).toBeNull();
    });
});
