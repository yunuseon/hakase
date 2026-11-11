import { defaultTickets, ticketsIn } from './shared/tickets.ts';
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
import { emptyBlueprints } from './blueprints.ts';
import { defaultSketch } from './settings.ts';
import { defaultSignal } from './shared/signal.ts';
import { entriesOf, startTimeline } from './timeline.ts';
import { defaultWorkspace, type WorkspaceAction } from './workspace.ts';

const viewport = { width: 1400, height: 900 };

const started = (): Documents => ({
    workspace: defaultWorkspace(viewport, inputsFor),
    settings: new Map(),
    tickets: new Map(),
    notes: new Map(),
    agendas: new Map(),
    habits: new Map(),
    clocks: new Map(),
    bookmarks: new Map(),
    signals: new Map(),
    paintings: new Map(),
    pens: new Map(),
    voices: new Map(),
    drums: new Map(),
    focusLinks: new Map(),
    pedals: new Map(),
    gates: new Map(),
    boxes: new Map(),
    sketchLinks: new Map(),
    library: emptyLibrary,
    blueprints: emptyBlueprints,
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
const launch = (program: 'bookmarks' | 'sketch' | 'tickets') =>
    act({ kind: 'launch', program, size: { width: 300, height: 300 }, viewport });
const labels = (history: History) => entriesOf(history).map(({ label }) => label);

describe('one log for every document', () => {
    it('deletes only selected programs and restores them in one undo step', () => {
        const start = run(fresh(), [launch('tickets'), launch('bookmarks')]);
        const { processes, stores } = start.present.workspace;
        const ids = processes.slice(-2).map(({ id }) => id);
        const deletion = act({ kind: 'close-selection', ids: [...ids, 'already-closed'] });
        const removed = reduce(start, deletion);

        expect(removed.present.workspace.processes).toEqual(processes.slice(0, -2));
        expect(removed.present.workspace.stores).toEqual(stores);
        expect(removed.steps).toHaveLength(start.steps.length + 1);
        expect(reduce(removed, deletion)).toBe(removed);

        const restored = reduce(removed, act({ kind: 'undo' }));
        expect(restored.present.workspace.processes).toEqual(processes);
        expect(reduce(restored, act({ kind: 'redo' })).present.workspace.processes).toEqual(
            processes.slice(0, -2),
        );
    });

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
            {
                kind: 'tickets',
                store: 'tickets',
                command: { kind: 'add', title: 'milk', status: null, parent: null },
            },
            ...drag('sketch-2', 2),
            { kind: 'signals', store: 'signal', command: { kind: 'shape', shape: 'saw' } },
        ]);
        const once = run(history, [{ kind: 'undo' }]);
        const twice = run(once, [{ kind: 'undo' }]);

        expect(once.present.signals.get('signal')?.shape ?? 'sine').toBe('sine');
        expect(ticketsIn(once.present.tickets.get('tickets') ?? defaultTickets)).toHaveLength(1);
        expect(frameOf(twice, 'sketch-2')).toEqual(frameOf(fresh(), 'sketch-2'));
        expect(
            ticketsIn(
                run(twice, [{ kind: 'undo' }]).present.tickets.get('tickets') ?? defaultTickets,
            ),
        ).toHaveLength(0);
        expect(labels(history)).toEqual([
            'Opened the app',
            'Edited tickets Main',
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
        expect(run(back, [launch('tickets')]).steps).toHaveLength(1);
    });

    it('names what a step makes by its place in the log', () => {
        const history = run(fresh(), [launch('bookmarks'), launch('sketch')]);

        expect(history.present.workspace.processes.map(({ id }) => id).slice(-2)).toEqual([
            `bookmarks-${history.seq - 1}`,
            `sketch-${history.seq}`,
        ]);
    });

    it('takes back an old launch and keeps every later window, ids, moves and all', () => {
        const history = run(fresh(), [launch('bookmarks'), launch('tickets')]);
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
            launch('tickets'),
            {
                kind: 'tickets',
                store: 'tickets',
                command: { kind: 'add', title: 'milk', status: null, parent: null },
            },
        ]);
        const window = filled.present.workspace.processes.at(-1)?.id ?? '';
        const forked = run(filled, [act({ kind: 'add-store', id: window, copy: true })]);
        const store = forked.present.workspace.processes.at(-1)?.store ?? '';

        expect(
            ticketsIn(forked.present.tickets.get(store) ?? defaultTickets).map(
                ({ title }) => title,
            ),
        ).toEqual(['milk']);
        expect(run(forked, [{ kind: 'undo' }]).present.tickets.has(store)).toBe(false);
    });

    it('lets a prune be undone, data and all', () => {
        const history = run(fresh(), [
            {
                kind: 'tickets',
                store: 'store-9',
                command: { kind: 'add', title: 'orphan', status: null, parent: null },
            },
            { kind: 'prune' },
        ]);

        expect(history.present.tickets.has('store-9')).toBe(false);
        expect(run(history, [{ kind: 'undo' }]).present.tickets.has('store-9')).toBe(true);
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
            tickets: new Map([['tickets', { ...defaultTickets, made: 40 }]]),
        };

        expect(seqFloor(documents)).toBe(40);
    });
});

describe('links', () => {
    const launched = (
        program: 'pen' | 'signal' | 'focus' | 'kaleido' | 'colourmap' | 'nand' | 'delay',
    ) => act({ kind: 'launch', program, size: { width: 300, height: 300 }, viewport });

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

    it('refuse a source of a kind the input does not take', () => {
        const before = run(fresh(), [launched('pen'), launched('focus')]);
        const history = run(before, [{ kind: 'link', store: 'pen', param: 'x', source: 'focus' }]);

        expect(history.present.pens.get('pen')?.sources.x ?? null).toBeNull();
        expect(history.steps).toHaveLength(before.steps.length);
    });

    it('refuse a link that would reach back to its own store', () => {
        const before = run(fresh(), [launched('pen'), launched('signal')]);
        const history = run(before, [
            { kind: 'link', store: 'signal', param: 'phase', source: 'signal' },
        ]);

        expect(history.present.signals.get('signal')?.sources.phase ?? null).toBeNull();
        expect(history.steps).toHaveLength(before.steps.length);
    });

    it("link a sketch's knob on its store, undo it, and keep what it follows through a prune", () => {
        const linked = run(fresh(), [
            launched('signal'),
            { kind: 'link', store: 'sketch-2', param: 'k2', source: 'signal' },
        ]);

        expect(linked.present.sketchLinks.get('sketch-2')?.sources.k2).toBe('signal');
        expect(run(linked, [{ kind: 'undo' }]).present.sketchLinks.has('sketch-2')).toBe(false);
        expect(
            run(linked, [{ kind: 'link', store: 'sketch-2', param: 'k2', source: null }]).present
                .sketchLinks.size,
        ).toBe(0);
        expect(
            run(linked, [
                { kind: 'link', store: 'sketch-2', param: 'k2', source: 'sketch-2' },
            ]).present.sketchLinks.get('sketch-2')?.sources.k2,
        ).toBe('signal');
    });

    it('chain pedals on their stores, and refuse a cable that would come back round', () => {
        const chained = run(fresh(), [
            launched('kaleido'),
            launched('colourmap'),
            { kind: 'link', store: 'kaleido-5', param: 'in', source: 'sketch-2' },
            { kind: 'link', store: 'colourmap-6', param: 'in', source: 'kaleido-5' },
        ]);
        const looped = run(chained, [
            { kind: 'link', store: 'kaleido-5', param: 'in', source: 'colourmap-6' },
        ]);

        expect(chained.present.pedals.get('kaleido-5')?.sources['in']).toBe('sketch-2');
        expect(chained.present.pedals.get('colourmap-6')?.sources['in']).toBe('kaleido-5');
        expect(looped.present.pedals.get('kaleido-5')?.sources['in']).toBe('sketch-2');
        expect(looped.steps).toHaveLength(chained.steps.length);
        // A store something links to is kept, so closing the sketch's window cannot take it away.
        expect(chained.present.workspace.stores.find(({ id }) => id === 'sketch-2')?.kept).toBe(
            true,
        );
    });

    it('refuse a loop of gates within a tick, and accept the same loop through a delay', () => {
        const wired = run(fresh(), [
            launched('nand'),
            launched('nand'),
            launched('delay'),
            { kind: 'link', store: 'nand-6', param: 'a', source: 'nand-5' },
        ]);
        const shorted = run(wired, [
            { kind: 'link', store: 'nand-5', param: 'a', source: 'nand-6' },
        ]);
        const delayed = run(wired, [
            { kind: 'link', store: 'delay-7', param: 'in', source: 'nand-6' },
            { kind: 'link', store: 'nand-5', param: 'a', source: 'delay-7' },
        ]);

        expect(shorted.present.gates.get('nand-5')?.sources['a'] ?? null).toBeNull();
        expect(delayed.present.gates.get('delay-7')?.sources['in']).toBe('nand-6');
        expect(delayed.present.gates.get('nand-5')?.sources['a']).toBe('delay-7');
    });

    it('refuse a pedal command to a store of no pedal', () => {
        const before = run(fresh(), [launched('kaleido')]);
        const after = run(before, [
            { kind: 'pedals', store: 'sketch-2', command: { kind: 'choice', choice: 'turn' } },
        ]);

        expect(after.present.pedals.has('sketch-2')).toBe(false);
    });

    it('let a focus timer follow an agenda, and undo it as one step', () => {
        const history = run(fresh(), [
            { kind: 'link', store: 'focus', param: 'agenda', source: 'store-3' },
            { kind: 'link', store: 'focus', param: 'agenda', source: 'store-3' },
            { kind: 'link', store: 'focus', param: 'lengths', source: 'store-3' },
        ]);

        expect(history.present.focusLinks.get('focus')).toEqual({ sources: { agenda: 'store-3' } });
        expect(history.steps).toHaveLength(1);
        expect(run(history, [{ kind: 'undo' }]).present.focusLinks.has('focus')).toBe(false);
        expect(
            run(history, [{ kind: 'link', store: 'focus', param: 'agenda', source: null }]).present
                .focusLinks.size,
        ).toBe(0);
    });

    it('keep an agenda a timer follows through a prune, though no window shows it', () => {
        const history = run(fresh(), [
            launched('focus'),
            {
                kind: 'agendas',
                store: 'store-7',
                command: { kind: 'add', id: 'block-1', day: '2026-11-05', start: 60, end: 120 },
            },
            { kind: 'link', store: 'focus', param: 'agenda', source: 'store-7' },
            { kind: 'prune' },
        ]);

        expect(history.present.agendas.has('store-7')).toBe(true);
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

    it('keeps a stroke in one step, its raise arriving before the stroke opens', () => {
        const drums = run(fresh(), [{ kind: 'drums', store: 'drums', command: { kind: 'clear' } }]);
        const paint = (step: number): DocumentAction => ({
            kind: 'drums',
            store: 'drums',
            command: { kind: 'paint', drum: 'tom', step, like: { drum: 'tom', step: 0 } },
        });
        const stroked = run(drums, [
            act({ kind: 'raise', id: drums.present.workspace.processes[0]?.id ?? '' }),
            { kind: 'drums', store: 'drums', command: { kind: 'tap', drum: 'tom', step: 0 } },
            paint(1),
            paint(2),
        ]);

        expect(stroked.present.drums.get('drums')?.pattern.tom.slice(0, 3)).toEqual([
            0.6, 0.6, 0.6,
        ]);
        expect(
            run(stroked, [{ kind: 'undo' }])
                .present.drums.get('drums')
                ?.pattern.tom.slice(0, 3),
        ).toEqual([0, 0, 0]);
    });
});

describe('ticket tags in the document log', () => {
    it('undoes tag edits and keeps forked categories independent', () => {
        const added = run(fresh(), [
            launch('tickets'),
            {
                kind: 'tickets',
                store: 'tickets',
                command: { kind: 'add', title: 'Work', parent: null, status: null },
            },
        ]);
        const id = ticketsIn(added.present.tickets.get('tickets') ?? defaultTickets)[0]?.id ?? '';
        const tagged = run(added, [
            {
                kind: 'tickets',
                store: 'tickets',
                command: { kind: 'tag', id, tags: ['work', 'ui'] },
            },
        ]);
        expect(
            ticketsIn(
                run(tagged, [{ kind: 'undo' }]).present.tickets.get('tickets') ?? defaultTickets,
            )[0]?.tags,
        ).toEqual([]);
        const window = tagged.present.workspace.processes.at(-1)?.id ?? '';
        const forked = run(tagged, [act({ kind: 'add-store', id: window, copy: true })]);
        const store = forked.present.workspace.processes.at(-1)?.store ?? '';
        const edited = run(forked, [
            { kind: 'tickets', store, command: { kind: 'untag', id, tag: 'ui' } },
        ]);
        expect(ticketsIn(edited.present.tickets.get(store) ?? defaultTickets)[0]?.tags).toEqual([
            'work',
        ]);
        expect(ticketsIn(edited.present.tickets.get('tickets') ?? defaultTickets)[0]?.tags).toEqual(
            ['ui', 'work'],
        );
    });
});

describe('complete ticket creation', () => {
    it('records all creation fields as one undoable step', () => {
        const created = run(fresh(), [
            {
                kind: 'tickets',
                store: 'tickets',
                command: {
                    kind: 'add',
                    title: 'Ship',
                    description: 'Ready to review',
                    priority: 'high',
                    tags: ['work'],
                    status: 'status-2',
                    parent: null,
                    blockedBy: [],
                },
            },
        ]);
        expect(created.steps).toHaveLength(1);
        expect(
            ticketsIn(created.present.tickets.get('tickets') ?? defaultTickets)[0],
        ).toMatchObject({
            title: 'Ship',
            description: 'Ready to review',
            priority: 'high',
            tags: ['work'],
        });
        expect(
            ticketsIn(
                run(created, [{ kind: 'undo' }]).present.tickets.get('tickets') ?? defaultTickets,
            ),
        ).toEqual([]);
    });
});
