import { describe, expect, it } from 'vitest';
import { defaultBoard } from './components/board/board.ts';
import { capturedActions } from './capture.ts';
import { inputsFor } from './inputs.fixture.ts';
import { defaultWorkspace } from './workspace.ts';

const base = defaultWorkspace({ width: 1400, height: 900 }, inputsFor);
const workspace = {
    ...base,
    stores: [
        ...base.stores,
        { id: 'store-1', program: 'todo', name: 'Groceries', kept: true, copy: null, clock: null },
        { id: 'store-2', program: 'board', name: 'Sprint', kept: true, copy: null, clock: null },
    ],
} as const;
const empty = { notes: new Map(), boards: new Map(), workspace };

describe('capturedActions', () => {
    it('adds a to-do to the chosen list, Main or another', () => {
        expect(
            capturedActions(
                { kind: 'capture', target: 'todo', store: 'store-1', text: 'Oat milk' },
                empty,
            ),
        ).toEqual([
            { kind: 'todos', store: 'store-1', command: { kind: 'add', text: 'Oat milk' } },
        ]);
        expect(
            capturedActions({ kind: 'capture', target: 'todo', store: 'todo', text: 'x' }, empty),
        ).toHaveLength(1);
    });

    it('creates a note after the last one in its state, written in the same step', () => {
        const notes = new Map([['note', { items: [{ id: 'note-4', text: 'old' }], made: 4 }]]);

        expect(
            capturedActions(
                { kind: 'capture', target: 'note', store: 'note', text: 'An idea' },
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

    it('puts a card in the first column of its board, a board never opened too', () => {
        const capture = {
            kind: 'capture',
            target: 'card',
            store: 'store-2',
            text: 'Ship',
        } as const;
        const renamed = {
            ...defaultBoard,
            columns: [{ id: 'column-9', title: 'Inbox', cards: [] }, ...defaultBoard.columns],
        };

        expect(capturedActions(capture, empty)).toEqual([
            {
                kind: 'boards',
                store: 'store-2',
                command: { kind: 'add-card', column: 'column-1', text: 'Ship' },
            },
        ]);
        expect(
            capturedActions(capture, { ...empty, boards: new Map([['store-2', renamed]]) })[0],
        ).toMatchObject({ command: { column: 'column-9' } });
        expect(
            capturedActions(capture, {
                ...empty,
                boards: new Map([['store-2', { columns: [], made: 0 }]]),
            }),
        ).toEqual([]);
    });

    it('takes nothing into a state of another program, or one that is gone', () => {
        expect(
            capturedActions(
                { kind: 'capture', target: 'todo', store: 'store-2', text: 'x' },
                empty,
            ),
        ).toEqual([]);
        expect(
            capturedActions(
                { kind: 'capture', target: 'card', store: 'store-7', text: 'x' },
                empty,
            ),
        ).toEqual([]);
    });
});
