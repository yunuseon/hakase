import { describe, expect, it } from 'vitest';
import {
    defaultWorkspace,
    parseWorkspace,
    reduceHistory,
    startHistory,
    type History,
    type WorkspaceAction,
} from './workspace.ts';

const viewport = { width: 1400, height: 900 };

const run = (history: History, actions: readonly WorkspaceAction[]): History =>
    actions.reduce(reduceHistory, history);

const fresh = (): History => startHistory(defaultWorkspace(viewport));

const frameOf = (history: History, id: string) =>
    history.present.processes.find(process => process.id === id)?.frame;

const firstId = (history: History): string => history.present.processes[0]?.id ?? '';

const drag = (id: string, steps: number): WorkspaceAction[] => [
    { kind: 'raise', id },
    ...Array.from({ length: steps }, (): WorkspaceAction => ({ kind: 'move', id, dx: 10, dy: 0 })),
];

describe('reduceHistory', () => {
    it('makes one drag one undo step', () => {
        const start = fresh();
        const id = firstId(start);
        const before = frameOf(start, id);
        const dragged = run(start, drag(id, 20));

        expect(frameOf(dragged, id)?.x).not.toBe(before?.x);

        const undone = reduceHistory(dragged, { kind: 'undo' });

        expect(frameOf(undone, id)).toEqual(before);
    });

    it('makes two drags two steps, split by the raise that starts each', () => {
        const start = fresh();
        const id = firstId(start);
        const twice = run(start, [...drag(id, 5), ...drag(id, 5)]);
        const once = reduceHistory(twice, { kind: 'undo' });

        expect(once.past).toHaveLength(1);
        expect(frameOf(once, id)?.x).toBe((frameOf(start, id)?.x ?? 0) + 50);
    });

    it('keeps the current camera through an undo', () => {
        const start = fresh();
        const id = firstId(start);
        const moved = run(start, [...drag(id, 3), { kind: 'pan', dx: 200, dy: 0 }]);
        const undone = reduceHistory(moved, { kind: 'undo' });

        expect(undone.present.camera).toEqual(moved.present.camera);
    });

    it('does not record camera moves as steps', () => {
        const panned = run(fresh(), [{ kind: 'pan', dx: 40, dy: 0 }]);

        expect(panned.past).toHaveLength(0);
    });

    it('redoes what was undone, and a new step drops the redo', () => {
        const start = fresh();
        const id = firstId(start);
        const dragged = run(start, drag(id, 3));
        const undone = reduceHistory(dragged, { kind: 'undo' });

        expect(frameOf(reduceHistory(undone, { kind: 'redo' }), id)).toEqual(frameOf(dragged, id));

        const diverged = run(undone, drag(id, 1));

        expect(diverged.future).toHaveLength(0);
    });

    it('clamps a resize to the minimum the action carries', () => {
        const start = fresh();
        const id = firstId(start);
        const shrunk = run(start, [
            { kind: 'raise', id },
            {
                kind: 'resize',
                id,
                edge: 'se',
                dx: -5000,
                dy: -5000,
                minimum: { width: 300, height: 250 },
            },
        ]);

        expect(frameOf(shrunk, id)).toMatchObject({ width: 300, height: 250 });
    });
});

describe('parseWorkspace', () => {
    const saved = (program: string) => {
        const workspace = defaultWorkspace(viewport);
        const [first, ...rest] = workspace.processes;

        const value: unknown = JSON.parse(
            JSON.stringify({
                ...workspace,
                processes: first === undefined ? rest : [{ ...first, program }, ...rest],
            }),
        );

        return value;
    };

    it('drops a window of an unknown program and keeps everything else', () => {
        const parsed = parseWorkspace(saved('retired'));

        expect(parsed?.processes).toHaveLength(defaultWorkspace(viewport).processes.length - 1);
    });

    it('brings a links window back as bookmarks', () => {
        expect(parseWorkspace(saved('links'))?.processes[0]?.program).toBe('bookmarks');
    });
});

describe('stores', () => {
    const launch = (program: 'bookmarks' | 'sketch'): WorkspaceAction => ({
        kind: 'launch',
        program,
        size: { width: 300, height: 300 },
        viewport,
    });
    const present = (history: History) => history.present;
    const storeOf = (history: History, id: string) =>
        present(history).processes.find(process => process.id === id)?.store;

    it('binds a shared program to its main store and a private one to a store of its own', () => {
        const history = run(fresh(), [launch('bookmarks'), launch('bookmarks'), launch('sketch')]);

        expect(storeOf(history, 'bookmarks-5')).toBe('bookmarks');
        expect(storeOf(history, 'bookmarks-6')).toBe('bookmarks');
        expect(storeOf(history, 'sketch-7')).toBe('sketch-7');
    });

    it('splits a window off with a copy, and binds it back', () => {
        const split = run(fresh(), [
            launch('bookmarks'),
            launch('bookmarks'),
            { kind: 'add-store', id: 'bookmarks-6', copy: true },
        ]);
        const store = present(split).stores.find(({ id }) => id === 'store-1');

        expect(storeOf(split, 'bookmarks-6')).toBe('store-1');
        expect(store).toMatchObject({ program: 'bookmarks', kept: true, copy: 'bookmarks' });
        expect(
            storeOf(
                run(split, [{ kind: 'bind-store', id: 'bookmarks-6', store: 'bookmarks' }]),
                'bookmarks-6',
            ),
        ).toBe('bookmarks');
    });

    it('never binds a window to another program’s store', () => {
        const history = run(fresh(), [
            launch('bookmarks'),
            { kind: 'bind-store', id: 'bookmarks-5', store: 'sketch-2' },
        ]);

        expect(storeOf(history, 'bookmarks-5')).toBe('bookmarks');
    });

    it('drops a launch’s own store with its last window, but keeps a named one', () => {
        const closed = run(fresh(), [launch('sketch'), { kind: 'quit', id: 'sketch-5' }]);
        const named = run(fresh(), [
            launch('sketch'),
            { kind: 'rename-store', id: 'sketch-5', store: 'sketch-5', name: 'Loud' },
            { kind: 'quit', id: 'sketch-5' },
        ]);

        expect(present(closed).stores.some(({ id }) => id === 'sketch-5')).toBe(false);
        expect(present(named).stores.find(({ id }) => id === 'sketch-5')?.name).toBe('Loud');
    });

    it('removes only a store no window uses', () => {
        const split = run(fresh(), [
            launch('bookmarks'),
            { kind: 'add-store', id: 'bookmarks-5', copy: false },
        ]);
        const inUse = run(split, [{ kind: 'remove-store', id: 'bookmarks-5', store: 'store-1' }]);
        const unused = run(split, [
            { kind: 'remove-store', id: 'bookmarks-5', store: 'bookmarks' },
        ]);

        expect(present(inUse).stores.some(({ id }) => id === 'store-1')).toBe(true);
        expect(present(unused).stores.some(({ id }) => id === 'bookmarks')).toBe(false);
    });

    it('undoes a split', () => {
        const split = run(fresh(), [
            launch('bookmarks'),
            { kind: 'add-store', id: 'bookmarks-5', copy: true },
        ]);

        expect(storeOf(run(split, [{ kind: 'undo' }]), 'bookmarks-5')).toBe('bookmarks');
    });
});

describe('parseWorkspace stores', () => {
    it('gives windows saved before stores their program’s main store or their own id', () => {
        const workspace = defaultWorkspace(viewport);
        const value: unknown = JSON.parse(
            JSON.stringify({
                ...workspace,
                stores: undefined,
                made: undefined,
                processes: workspace.processes.map(({ store: _, ...process }) => process),
            }),
        );
        const parsed = parseWorkspace(value);

        expect(parsed?.processes.map(({ store }) => store)).toEqual([
            'formula-1',
            'sketch-2',
            'timeline',
            'playhead',
        ]);
        expect(parsed?.stores.map(({ id }) => id).sort()).toEqual([
            'formula-1',
            'playhead',
            'sketch-2',
            'timeline',
        ]);
    });
});
