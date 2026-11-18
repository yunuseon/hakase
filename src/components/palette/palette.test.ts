import { describe, expect, it } from 'vitest';
import { entriesOf, matched } from './palette.ts';

const commands = [
    {
        id: 'capture:todo:todo',
        label: 'Add to-do to Main',
        hint: 'todo …',
        keyword: 'todo',
        group: 'Capture',
        icon: null,
    },
    {
        id: 'capture:todo:store-1',
        label: 'Add to-do to Groceries',
        hint: 'todo …',
        keyword: 'todo',
        group: 'Capture',
        icon: null,
    },
    { id: 'launch:todo', label: 'New todo', hint: '', keyword: null, group: 'Create', icon: null },
    {
        id: 'workspace:fit',
        label: 'Fit everything in view',
        hint: '',
        keyword: null,
        group: 'View',
        icon: null,
    },
] as const;

describe('matched', () => {
    it('hands the rest of the query to every command its first word names', () => {
        expect(matched(commands, '  Todo  buy oat milk ')).toEqual([
            { command: commands[0], text: 'buy oat milk' },
            { command: commands[1], text: 'buy oat milk' },
        ]);
    });

    it('filters as before while the keyword has no text yet', () => {
        expect(matched(commands, 'todo').map(({ command, text }) => [command.id, text])).toEqual([
            ['capture:todo:todo', null],
            ['capture:todo:store-1', null],
            ['launch:todo', null],
        ]);
        expect(matched(commands, '').length).toBe(4);
    });

    it('treats a word that is no keyword as a filter', () => {
        expect(matched(commands, 'fit view')).toEqual([{ command: commands[3], text: null }]);
        expect(matched(commands, 'fit buy milk')).toEqual([]);
    });
});

describe('entriesOf', () => {
    it('heads each run of one group once, keeping every row its index', () => {
        expect(
            entriesOf(matched(commands, '')).map(entry =>
                entry.kind === 'heading' ? entry.title : entry.index,
            ),
        ).toEqual(['Capture', 0, 1, 'Create', 2, 'View', 3]);
    });

    it('finds a command by its group', () => {
        expect(matched(commands, 'view').map(({ command }) => command.id)).toEqual([
            'workspace:fit',
        ]);
    });
});
