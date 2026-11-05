import { describe, expect, it } from 'vitest';
import { defaultBoard } from './components/board/board.ts';
import { capturedActions } from './capture.ts';

const empty = { notes: new Map(), boards: new Map() };

describe('capturedActions', () => {
    it('adds a to-do to the main list', () => {
        expect(
            capturedActions({ kind: 'capture', target: 'todo', text: 'Call Ada' }, empty),
        ).toEqual([{ kind: 'todos', store: 'todo', command: { kind: 'add', text: 'Call Ada' } }]);
    });

    it('creates a note after the last one, written in the same step', () => {
        const notes = new Map([['note', { items: [{ id: 'note-4', text: 'old' }], made: 4 }]]);

        expect(
            capturedActions(
                { kind: 'capture', target: 'note', text: 'An idea' },
                { ...empty, notes },
            ),
        ).toEqual([
            {
                kind: 'notes',
                store: 'note',
                command: { kind: 'create', id: 'note-5', text: 'An idea' },
            },
        ]);
    });

    it('puts a card in the first column, on a board never opened too', () => {
        const capture = { kind: 'capture', target: 'card', text: 'Ship it' } as const;
        const renamed = {
            ...defaultBoard,
            columns: [{ id: 'column-9', title: 'Inbox', cards: [] }, ...defaultBoard.columns],
        };

        expect(capturedActions(capture, empty)).toEqual([
            {
                kind: 'boards',
                store: 'board',
                command: { kind: 'add-card', column: 'column-1', text: 'Ship it' },
            },
        ]);
        expect(
            capturedActions(capture, { ...empty, boards: new Map([['board', renamed]]) })[0],
        ).toMatchObject({ command: { column: 'column-9' } });
        expect(
            capturedActions(capture, {
                ...empty,
                boards: new Map([['board', { columns: [], made: 0 }]]),
            }),
        ).toEqual([]);
    });
});
