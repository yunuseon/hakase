import { describe, expect, it } from 'vitest';
import { matched } from './palette.ts';

const commands = [
    { id: 'capture:todo:todo', label: 'Add to-do to Main', hint: 'todo …', keyword: 'todo' },
    {
        id: 'capture:todo:store-1',
        label: 'Add to-do to Groceries',
        hint: 'todo …',
        keyword: 'todo',
    },
    { id: 'launch:todo', label: 'New todo', hint: 'open', keyword: null },
    { id: 'workspace:fit', label: 'Fit everything in view', hint: 'zoom', keyword: null },
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
