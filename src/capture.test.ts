import { describe, expect, it } from 'vitest';
import { capturedActions } from './capture.ts';
import { inputsFor } from './inputs.fixture.ts';
import { defaultWorkspace } from './workspace.ts';

const base = defaultWorkspace({ width: 1400, height: 900 }, inputsFor);
const workspace = {
    ...base,
    stores: [
        ...base.stores,
        {
            id: 'store-1',
            program: 'tickets',
            name: 'Groceries',
            kept: true,
            copy: null,
            clock: null,
        },
        { id: 'store-2', program: 'note', name: 'Ideas', kept: true, copy: null, clock: null },
    ],
} as const;
const empty = { notes: new Map(), workspace };

describe('capturedActions', () => {
    it('adds a ticket through either keyword, into Main or a chosen state', () => {
        for (const target of ['todo', 'ticket'] as const) {
            expect(
                capturedActions(
                    { kind: 'capture', target, store: 'store-1', text: 'Oat milk' },
                    empty,
                ),
            ).toEqual([
                {
                    kind: 'tickets',
                    store: 'store-1',
                    command: { kind: 'add', title: 'Oat milk', status: null, parent: null },
                },
            ]);
            expect(
                capturedActions({ kind: 'capture', target, store: 'tickets', text: 'Ship' }, empty),
            ).toHaveLength(1);
        }
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

    it('takes nothing into a state of another program, or one that is gone', () => {
        expect(
            capturedActions(
                { kind: 'capture', target: 'ticket', store: 'store-2', text: 'x' },
                empty,
            ),
        ).toEqual([]);
        expect(
            capturedActions(
                { kind: 'capture', target: 'ticket', store: 'store-7', text: 'x' },
                empty,
            ),
        ).toEqual([]);
    });
});
