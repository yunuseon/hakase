import { describe, expect, it } from 'vitest';
import {
    documentsKit,
    reduceHistory,
    seqFloor,
    type DocumentAction,
    type Documents,
    type History,
    type TimeCommand,
} from './documents.ts';
import { inputsFor } from './inputs.fixture.ts';
import { emptyLibrary } from './library.ts';
import { emptyPieces } from './pieces.ts';
import { defaultSketch } from './settings.ts';
import { defaultSignal } from './shared/signal.ts';
import { entriesOf, startTimeline } from './timeline.ts';
import { defaultWorkspace, type WorkspaceAction } from './workspace.ts';

const viewport = { width: 1400, height: 900 };

const started = (): Documents => ({
    workspace: defaultWorkspace(viewport, inputsFor),
    settings: new Map(),
    todos: new Map(),
    boards: new Map(),
    notes: new Map(),
    agendas: new Map(),
    habits: new Map(),
    clocks: new Map(),
    bookmarks: new Map(),
    signals: new Map(),
    paintings: new Map(),
    pens: new Map(),
    voices: new Map(),
    library: emptyLibrary,
    pieces: emptyPieces,
    formulas: new Map(),
    themes: new Map(),
    looks: new Map(),
    look: 'paper',
});

const reduce = reduceHistory(documentsKit(inputsFor));
const fresh = (documents = started()): History => startTimeline(documents, seqFloor(documents));
const run = (history: History, actions: readonly (DocumentAction | TimeCommand)[]) =>
    actions.reduce(reduce, history);
const act = (action: WorkspaceAction): DocumentAction => ({ kind: 'workspace', action });

const frameOf = (history: History, id: string) =>
    history.present.workspace.processes.find(process => process.id === id)?.frame;
const drag = (id: string, steps: number): DocumentAction[] => [
    act({ kind: 'raise', id }),
    ...Array.from({ length: steps }, () => act({ kind: 'move', id, dx: 10, dy: 0 })),
];
const launch = (program: 'bookmarks' | 'sketch' | 'todo') =>
    act({ kind: 'launch', program, size: { width: 300, height: 300 }, viewport });
const labels = (history: History) => entriesOf(history).map(({ label }) => label);

describe('one log for every document', () => {
    it('makes one drag one step, and two drags two, split by the raise that starts each', () => {
        const start = fresh();
        const before = frameOf(start, 'sketch-2');
        const once = run(start, drag('sketch-2', 20));
        const twice = run(start, [...drag('sketch-2', 5), ...drag('sketch-2', 5)]);

        expect(frameOf(run(once, [{ kind: 'undo' }]), 'sketch-2')).toEqual(before);
        expect(twice.steps).toHaveLength(2);
        expect(frameOf(run(twice, [{ kind: 'undo' }]), 'sketch-2')).toEqual(
            frameOf(run(start, drag('sketch-2', 5)), 'sketch-2'),
        );
    });

    it('keeps the camera through an undo, and never records it as a step', () => {
        const moved = run(fresh(), [...drag('sketch-2', 3), act({ kind: 'pan', dx: 200, dy: 0 })]);

        expect(moved.steps).toHaveLength(1);
        expect(run(moved, [{ kind: 'undo' }]).present.workspace.camera).toEqual(
            moved.present.workspace.camera,
        );
    });

    it('undoes across documents in the order they changed', () => {
        const history = run(fresh(), [
            { kind: 'todos', store: 'todo', command: { kind: 'add', text: 'milk' } },
            ...drag('sketch-2', 2),
            { kind: 'signals', store: 'signal', command: { kind: 'shape', shape: 'saw' } },
        ]);
        const once = run(history, [{ kind: 'undo' }]);
        const twice = run(once, [{ kind: 'undo' }]);

        expect(once.present.signals.get('signal')?.shape ?? 'sine').toBe('sine');
        expect(once.present.todos.get('todo')?.items).toHaveLength(1);
        expect(frameOf(twice, 'sketch-2')).toEqual(frameOf(fresh(), 'sketch-2'));
        expect(run(twice, [{ kind: 'undo' }]).present.todos.get('todo')?.items ?? []).toHaveLength(
            0,
        );
        expect(labels(history)).toEqual([
            'Opened the app',
            'Edited todo list Main',
            'Moved sketch',
            'Edited signal Main',
        ]);
    });

    it('redoes what was undone, travels like that many undos, and a new step drops the redo', () => {
        const history = run(fresh(), [launch('bookmarks'), ...drag('sketch-2', 2)]);
        const back = run(history, [{ kind: 'travel', offset: -2 }]);

        expect(back.present.workspace).toEqual(
            run(history, [{ kind: 'undo' }, { kind: 'undo' }]).present.workspace,
        );
        expect(run(back, [{ kind: 'redo' }, { kind: 'redo' }]).present.workspace.processes).toEqual(
            history.present.workspace.processes,
        );
        expect(run(back, [launch('todo')]).steps).toHaveLength(1);
    });

    it('names what a step makes by its place in the log', () => {
        const history = run(fresh(), [launch('bookmarks'), launch('sketch')]);

        expect(history.present.workspace.processes.map(({ id }) => id).slice(-2)).toEqual([
            `bookmarks-${history.seq - 1}`,
            `sketch-${history.seq}`,
        ]);
    });

    it('takes back an old launch and keeps every later window, ids, moves and all', () => {
        const history = run(fresh(), [launch('bookmarks'), launch('todo')]);
        const todo = history.present.workspace.processes.at(-1)?.id ?? '';
        const moved = run(history, drag(todo, 3));
        const first = moved.steps[0]?.id ?? -1;
        const back = run(moved, [{ kind: 'take-back', id: first }]);
        const ids = back.present.workspace.processes.map(({ id }) => id);

        expect(ids.some(id => id.startsWith('bookmarks-'))).toBe(false);
        expect(ids).toContain(todo);
        expect(frameOf(back, todo)).toEqual(frameOf(moved, todo));
        expect(labels(back).at(-1)).toBe('Took back “Opened bookmarks”');
        expect(run(back, [{ kind: 'undo' }]).present.workspace.processes).toHaveLength(
            moved.present.workspace.processes.length,
        );
    });

    it('makes a fork and its copy one step, so one undo takes both back', () => {
        const filled = run(fresh(), [
            launch('todo'),
            { kind: 'todos', store: 'todo', command: { kind: 'add', text: 'milk' } },
        ]);
        const window = filled.present.workspace.processes.at(-1)?.id ?? '';
        const forked = run(filled, [act({ kind: 'add-store', id: window, copy: true })]);
        const store = forked.present.workspace.processes.at(-1)?.store ?? '';

        expect(forked.present.todos.get(store)?.items.map(({ text }) => text)).toEqual(['milk']);
        expect(run(forked, [{ kind: 'undo' }]).present.todos.has(store)).toBe(false);
    });

    it('lets a prune be undone, data and all', () => {
        const history = run(fresh(), [
            { kind: 'todos', store: 'store-9', command: { kind: 'add', text: 'orphan' } },
            { kind: 'prune' },
        ]);

        expect(history.present.todos.has('store-9')).toBe(false);
        expect(run(history, [{ kind: 'undo' }]).present.todos.has('store-9')).toBe(true);
    });

    it('refuses a signal source that would loop, against the state it would change', () => {
        const chained = run(fresh(), [
            {
                kind: 'signals',
                store: 'a',
                command: { kind: 'source', param: 'depth', source: 'b' },
            },
        ]);
        const looped = run(chained, [
            {
                kind: 'signals',
                store: 'b',
                command: { kind: 'source', param: 'phase', source: 'a' },
            },
        ]);

        expect(looped).toBe(chained);
        expect(chained.present.signals.get('a')?.sources.depth).toBe('b');
        expect(chained.present.signals.get('b') ?? defaultSignal).toEqual(defaultSignal);
    });

    it('hands a restored edit back to every editor, its writer’s included', () => {
        const typed = run(fresh(), [
            { kind: 'formula', formula: 'rose', text: 'one', from: 'formula-1' },
            act({ kind: 'raise', id: 'sketch-2' }),
            { kind: 'formula', formula: 'rose', text: 'two', from: 'formula-1' },
        ]);

        expect(run(typed, [{ kind: 'undo' }]).present.formulas.get('rose')).toEqual({
            value: 'one',
            from: null,
        });
    });

    it('leaves a turn of the view out of history, but not a change to what a sketch draws', () => {
        const orbit = { ...defaultSketch, orbit: { ...defaultSketch.orbit, yaw: 1 } };
        const denser = { ...orbit, panel: { ...orbit.panel, dimension: 64 } };
        const history = run(fresh(), [
            { kind: 'settings', key: 'sketch-2', settings: defaultSketch },
            { kind: 'settings', key: 'sketch-2', settings: orbit },
        ]);

        expect(history.steps).toHaveLength(0);
        expect(
            run(history, [{ kind: 'settings', key: 'sketch-2', settings: denser }]).steps,
        ).toHaveLength(1);
        expect(
            run(fresh(), [
                { kind: 'settings', key: 'sketch-2', settings: { ...defaultSketch, tab: 'scene' } },
            ]).steps,
        ).toHaveLength(0);
        expect(
            run(fresh(), [
                {
                    kind: 'settings',
                    key: 'formula-1',
                    settings: { kind: 'formula', formula: 'rose' },
                },
            ]).steps,
        ).toHaveLength(0);
    });

    it('starts a save from before the log above every counter it holds', () => {
        const documents = {
            ...started(),
            todos: new Map([['todo', { items: [], made: 40 }]]),
        };

        expect(seqFloor(documents)).toBe(40);
    });
});

describe('links', () => {
    const launched = (program: 'pen' | 'signal') =>
        act({ kind: 'launch', program, size: { width: 300, height: 300 }, viewport });

    it('set a store input on whichever document owns the store, a signal or a pen', () => {
        const history = run(fresh(), [
            launched('pen'),
            launched('signal'),
            { kind: 'link', store: 'pen', param: 'x', source: 'signal' },
            { kind: 'link', store: 'signal', param: 'depth', source: 'other' },
            { kind: 'link', store: 'pen', param: 'nonsense', source: 'signal' },
        ]);

        expect(history.present.pens.get('pen')?.sources.x).toBe('signal');
        expect(history.present.signals.get('signal')?.sources.depth).toBe('other');
        expect(history.steps).toHaveLength(4);
        expect(labels(history).at(-1)).toBe('Set Main depth to follow other');
    });

    it('keep a signal a pen follows through a prune, though no window shows it', () => {
        const history = run(fresh(), [
            launched('pen'),
            { kind: 'signals', store: 'store-7', command: { kind: 'shape', shape: 'saw' } },
            { kind: 'link', store: 'pen', param: 'y', source: 'store-7' },
            { kind: 'signals', store: 'store-8', command: { kind: 'shape', shape: 'saw' } },
            { kind: 'prune' },
        ]);

        expect(history.present.signals.has('store-7')).toBe(true);
        expect(history.present.signals.has('store-8')).toBe(false);
    });

    it('moves the camera when a flight sets it', () => {
        const camera = { x: 5, y: 6, zoom: 0.5 };

        expect(
            run(fresh(), [act({ kind: 'set-camera', camera })]).present.workspace.camera,
        ).toEqual(camera);
    });
});
