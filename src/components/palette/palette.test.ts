import { describe, expect, it } from 'vitest';
import { matched } from './palette.ts';

const commands = [
    { id: 'capture:todo', label: 'Add to-do', hint: 'todo …', keyword: 'todo' },
    { id: 'launch:todo', label: 'New todo', hint: 'open', keyword: null },
    { id: 'workspace:fit', label: 'Fit everything in view', hint: 'zoom', keyword: null },
] as const;

describe('matched', () => {
    it('hands the rest of the query to the command its first word names', () => {
        expect(matched(commands, '  Todo  buy oat milk ')).toEqual([
            { command: commands[0], text: 'buy oat milk' },
        ]);
    });

    it('filters as before while the keyword has no text yet', () => {
        expect(matched(commands, 'todo').map(({ command, text }) => [command.id, text])).toEqual([
            ['capture:todo', null],
            ['launch:todo', null],
        ]);
        expect(matched(commands, '').length).toBe(3);
    });

    it('treats a word that is no keyword as a filter', () => {
        expect(matched(commands, 'fit view')).toEqual([{ command: commands[2], text: null }]);
        expect(matched(commands, 'fit buy milk')).toEqual([]);
    });
});
