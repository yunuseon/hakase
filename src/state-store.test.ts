import { describe, expect, it } from 'vitest';
import { parseSnapshot } from './state-store.ts';
import { inputsFor } from './inputs.fixture.ts';
import { defaultWorkspace } from './workspace.ts';
import { ticketsIn } from './shared/tickets.ts';

const base = defaultWorkspace({ width: 1400, height: 900 }, inputsFor);
const frame = { x: 10, y: 20, z: 0, width: 360, height: 420 };
const todo = { items: [{ id: 'todo-8', text: 'Buy milk', done: true }], made: 8 };
const board = {
    columns: [{ id: 'column-4', title: 'Ideas', cards: [{ id: 'card-9', text: 'Ship' }] }],
    made: 9,
};
const window = (program: string, store?: string) => ({
    id: `${program}-1`,
    program,
    frame,
    follows: {},
    ...(store === undefined ? {} : { store }),
});

const saved = {
    version: 1,
    workspace: {
        ...base,
        processes: [
            window('todo', 'todo'),
            window('board', 'board'),
            {
                ...window('progress', 'progress'),
                follows: { source: { kind: 'todo', store: 'todo' } },
            },
        ],
        stores: [
            { id: 'todo', program: 'todo', name: 'Main', kept: true },
            { id: 'board', program: 'board', name: 'Main', kept: true },
        ],
    },
    todos: { byStore: { todo, 'store-7': todo } },
    board: { byStore: { board, 'store-8': board } },
};

describe('ticket snapshot migration', () => {
    it('preserves both Main documents and every named state separately', () => {
        const restored = parseSnapshot(saved, inputsFor);
        expect([...(restored?.tickets.keys() ?? [])]).toEqual([
            'tickets',
            'store-7',
            'board',
            'store-8',
        ]);
        expect(
            ticketsIn(restored?.tickets.get('tickets') ?? { statuses: [], made: 0, numbered: 0 }),
        ).toMatchObject([{ id: 'todo-8', title: 'Buy milk', number: 1 }]);
        expect(
            restored?.tickets.get('tickets')?.statuses.find(({ stage }) => stage === 'done')
                ?.tickets,
        ).toHaveLength(1);
        expect(restored?.tickets.get('board')?.statuses[0]?.tickets[0]?.title).toBe('Ship');
        expect(restored?.workspace?.stores.find(({ id }) => id === 'board')).toMatchObject({
            program: 'tickets',
            name: 'Board',
        });
        expect(restored?.settings.get('board-1')).toEqual({ kind: 'tickets', view: 'board' });
        expect(
            restored?.workspace?.processes.map(({ program, store, follows }) => [
                program,
                store,
                follows,
            ]),
        ).toEqual([
            ['tickets', 'tickets', {}],
            ['tickets', 'board', {}],
            ['progress', 'progress', { source: { kind: 'tickets', store: 'tickets' } }],
        ]);
    });

    it('preserves a board before stores existed, including one without an open window', () => {
        const restored = parseSnapshot(
            {
                ...saved,
                workspace: { ...base, processes: [window('board')], stores: [] },
                todos: todo,
                board,
            },
            inputsFor,
        );
        expect(restored?.workspace?.processes[0]?.store).toBe('board');
        expect(restored?.workspace?.stores.find(({ id }) => id === 'board')?.program).toBe(
            'tickets',
        );
        const closed = parseSnapshot({ ...saved, workspace: base, board }, inputsFor);
        expect(closed?.workspace?.stores.find(({ id }) => id === 'board')?.kept).toBe(true);
    });

    it('prefers current ticket documents over legacy fields and preserves an explicit view', () => {
        const restored = parseSnapshot(
            {
                ...saved,
                tickets: { byStore: { tickets: todo } },
                settings: { 'board-1': { kind: 'tickets', view: 'list' } },
            },
            inputsFor,
        );
        expect([...(restored?.tickets.keys() ?? [])]).toEqual(['tickets']);
        expect(restored?.settings.get('board-1')).toEqual({ kind: 'tickets', view: 'list' });
        expect(parseSnapshot({ version: 999 }, inputsFor)).toBeNull();
    });
});

describe('sketch link migration', () => {
    const sketch = {
        id: 'sketch-2',
        program: 'sketch',
        store: 'sketch-2',
        frame,
        follows: {
            playback: { kind: 'playback', store: 'timeline' },
            k2: { kind: 'signal', store: 'signal' },
            colour: { kind: 'voice', store: 'voice' },
            paint: { kind: 'pen', store: 'pen' },
            k3: { kind: 'focus', store: 'focus' },
        },
    };
    const before = {
        version: 1,
        workspace: {
            ...base,
            processes: [sketch],
            stores: [{ id: 'sketch-2', program: 'sketch', name: 'sketch 2', kept: false }],
        },
    };

    it('moves what a sketch window followed onto its store, keeping only the clock on the window', () => {
        const restored = parseSnapshot(before, inputsFor);

        expect(restored?.sketchLinks.get('sketch-2')?.sources).toMatchObject({
            k1: null,
            k2: 'signal',
            colour: 'envelope-of-voice',
            paint: 'pen',
            k3: null,
        });
        expect(restored?.converters.get('envelope-of-voice')?.sources.in).toBe('voice');
        expect(
            restored?.workspace?.stores.find(({ id }) => id === 'envelope-of-voice')?.program,
        ).toBe('sound-level');
        expect(restored?.workspace?.processes[0]?.follows).toEqual({
            playback: { kind: 'playback', store: 'timeline' },
        });
    });

    it('prefers links saved on the store over a window follow left from before', () => {
        const restored = parseSnapshot(
            {
                ...before,
                sketchLinks: {
                    byStore: { 'sketch-2': { sources: { k1: 'store-4', k2: 7 } } },
                },
            },
            inputsFor,
        );

        expect(restored?.sketchLinks.get('sketch-2')?.sources).toMatchObject({
            k1: 'store-4',
            k2: null,
        });
    });
});

describe('constant migration', () => {
    it('brings back a constant as a switch, on at its old default unless it was saved off', () => {
        const restored = parseSnapshot(
            {
                version: 1,
                workspace: {
                    ...base,
                    processes: [
                        window('const', 'const-1'),
                        { ...window('const', 'const-2'), id: 'const-2' },
                    ],
                    stores: [
                        { id: 'const-1', program: 'const', name: 'const 1', kept: false },
                        { id: 'const-2', program: 'const', name: 'const 2', kept: false },
                    ],
                },
                gates: { byStore: { 'const-2': { kind: 'const', value: 0 } } },
            },
            inputsFor,
        );

        expect(
            restored?.workspace?.processes.filter(({ program }) => program === 'switch'),
        ).toHaveLength(2);
        expect(restored?.gates.get('const-1')).toMatchObject({ kind: 'switch', value: 1 });
        expect(restored?.gates.get('const-2')).toMatchObject({ kind: 'switch', value: 0 });
    });
});

describe('picture aspect', () => {
    it('restores a saved aspect and falls back for a forged one', () => {
        expect(parseSnapshot({ ...saved, aspect: '16:9' }, inputsFor)?.aspect).toBe('16:9');
        expect(parseSnapshot({ ...saved, aspect: '7:3' }, inputsFor)?.aspect).toBe('1:1');
        expect(parseSnapshot(saved, inputsFor)?.aspect).toBe('1:1');
    });
});
