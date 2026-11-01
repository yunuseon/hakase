import { describe, expect, it } from 'vitest';
import { displayable, rowsOf, textOf, toggled } from './inspector.ts';

describe('displayable', () => {
    it('writes maps and sets as plain data, and never loses a key', () => {
        const value = displayable({
            stores: new Map([['a/b', { n: 1 }]]),
            tags: new Set(['x']),
            gone: undefined,
            inf: Infinity,
        });

        expect(value).toEqual({
            stores: { 'a/b': { n: 1 } },
            tags: ['x'],
            gone: null,
            inf: 'Infinity',
        });
    });
});

describe('rowsOf', () => {
    const state = displayable({ name: 'Main', groups: [{ id: 'g', items: [1, 2] }], open: true });

    it('shows only the top level until something is expanded', () => {
        expect(rowsOf(state, new Set()).map(({ path, text }) => `${path}=${text}`)).toEqual([
            'name="Main"',
            'groups=[1]',
            'open=true',
        ]);
    });

    it('walks into expanded branches only', () => {
        const rows = rowsOf(state, new Set(['groups', 'groups/0']));

        expect(rows.map(({ path, depth }) => `${depth}:${path}`)).toEqual([
            '0:name',
            '0:groups',
            '1:groups/0',
            '2:groups/0/id',
            '2:groups/0/items',
            '0:open',
        ]);
        expect(rows.find(({ path }) => path === 'groups')?.open).toBe(true);
    });

    it('keeps paths apart when a key holds a slash', () => {
        const rows = rowsOf(displayable({ 'a/b': { c: 1 } }), new Set(['a%2Fb']));

        expect(rows.map(({ path }) => path)).toEqual(['a%2Fb', 'a%2Fb/c']);
    });
});

describe('textOf', () => {
    it('summarises containers and shortens long text', () => {
        expect(textOf({ a: 1, b: 2 })).toBe('{2}');
        expect(textOf('x'.repeat(500))).toHaveLength(160);
        expect(textOf(null)).toBe('null');
    });
});

describe('toggled', () => {
    it('opens and closes a path', () => {
        expect(toggled(['a'], 'b')).toEqual(['a', 'b']);
        expect(toggled(['a', 'b'], 'a')).toEqual(['b']);
    });
});
