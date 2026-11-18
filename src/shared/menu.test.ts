import { describe, expect, it } from 'vitest';
import { closedMenu, DESTRUCTIVE, ordered, pickedBy, reduceMenu, type MenuAction } from './menu.ts';

const item = (id: string, destructive = false) => ({ id, label: id, glyph: '', destructive });

describe('a menu', () => {
    it('puts destructive items last, in a group of their own, and drops empty groups', () => {
        const groups = ordered([
            { id: 'a', items: [item('save'), item('delete', true)] },
            { id: 'b', items: [item('clear', true)] },
            { id: 'c', items: [item('share')] },
        ]);

        expect(groups.map(({ id, items }) => [id, items.map(each => each.id)])).toEqual([
            ['a', ['save']],
            ['c', ['share']],
            [DESTRUCTIVE, ['delete', 'clear']],
        ]);
    });

    it('picks a plain item at once and closes', () => {
        const open = reduceMenu(closedMenu, { kind: 'toggle' });
        const choose: MenuAction = { kind: 'choose', item: item('save') };

        expect(pickedBy(open, choose)).toBe('save');
        expect(reduceMenu(open, choose)).toEqual(closedMenu);
    });

    it('asks once before a destructive item, and forgets the asking when disarmed', () => {
        const open = reduceMenu(closedMenu, { kind: 'toggle' });
        const choose: MenuAction = { kind: 'choose', item: item('delete', true) };
        const armed = reduceMenu(open, choose);

        expect(pickedBy(open, choose)).toBeNull();
        expect(armed).toEqual({ open: true, armed: 'delete' });
        expect(pickedBy(armed, choose)).toBe('delete');
        expect(reduceMenu(armed, { kind: 'disarm' })).toEqual({ open: true, armed: null });
    });

    it('never picks a disabled item', () => {
        const open = reduceMenu(closedMenu, { kind: 'toggle' });
        const choose: MenuAction = {
            kind: 'choose',
            item: { ...item('delete'), disabled: true },
        };

        expect(pickedBy(open, choose)).toBeNull();
        expect(reduceMenu(open, choose)).toBe(open);
    });
});
