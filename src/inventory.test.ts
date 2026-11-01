import { describe, expect, it } from 'vitest';
import { catalogOf, parseTarget, targetId } from './inventory.ts';
import { defaultWorkspace } from './workspace.ts';

const workspace = defaultWorkspace({ width: 1400, height: 900 });

describe('targets', () => {
    it('round-trip through their ids, store ids with colons included', () => {
        const target = { kind: 'store' as const, program: 'bookmarks' as const, store: 'odd:id' };

        expect(parseTarget(targetId(target))).toEqual(target);
        expect(parseTarget('global:library')).toEqual({ kind: 'global', name: 'library' });
        expect(parseTarget('global:nope')).toBeNull();
        expect(parseTarget('store:nope:x')).toBeNull();
    });
});

describe('catalogOf', () => {
    const catalog = catalogOf(
        workspace.stores,
        workspace.processes,
        program => program,
        new Set(['board']),
    );

    it('lists a main store that holds data, and leaves out empty ones and programs with no stores', () => {
        const titles = catalog.map(({ title }) => title);

        expect(titles).toContain('board');
        expect(titles).not.toContain('todo');
        expect(titles).toContain('sketch');
        expect(titles).not.toContain('theme');
        expect(titles).not.toContain('timeline');
        expect(titles.at(-1)).toBe('global');
    });

    it('counts the windows bound to each store', () => {
        const sketch = catalog.find(({ title }) => title === 'sketch');
        const board = catalog.find(({ title }) => title === 'board');

        expect(sketch?.items[0]).toMatchObject({ label: 'sketch 2', users: 1 });
        expect(board?.items[0]).toMatchObject({ label: 'Main', users: 0 });
    });
});
