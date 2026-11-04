import { describe, expect, it } from 'vitest';
import {
    defaultWorkspace,
    labelOf,
    parseWorkspace,
    reduceWorkspace,
    usedStores,
    type Workspace,
    type WorkspaceAction,
} from './workspace.ts';
import { inputsFor } from './inputs.fixture.ts';
import { defaultSignal } from './shared/signal.ts';

const viewport = { width: 1400, height: 900 };

type History = { readonly present: Workspace };

const run = (history: History, actions: readonly WorkspaceAction[]): History => ({
    present: actions.reduce(
        (workspace, action) => reduceWorkspace(workspace, action, inputsFor),
        history.present,
    ),
});

const fresh = (): History => ({ present: defaultWorkspace(viewport, inputsFor) });

describe('parseWorkspace', () => {
    const saved = (program: string) => {
        const workspace = defaultWorkspace(viewport, inputsFor);
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
        const parsed = parseWorkspace(saved('retired'), inputsFor);

        expect(parsed?.processes).toHaveLength(
            defaultWorkspace(viewport, inputsFor).processes.length - 1,
        );
    });

    it('brings a renamed program back as the one that replaced it', () => {
        expect(parseWorkspace(saved('links'), inputsFor)?.processes[0]?.program).toBe('bookmarks');
        expect(parseWorkspace(saved('patch'), inputsFor)?.processes[0]?.program).toBe('state');
        expect(parseWorkspace(saved('inspector'), inputsFor)?.processes[0]?.program).toBe('state');
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
});

describe('parseWorkspace stores', () => {
    it('gives windows saved before stores their program’s main store or their own id', () => {
        const workspace = defaultWorkspace(viewport, inputsFor);
        const value: unknown = JSON.parse(
            JSON.stringify({
                ...workspace,
                stores: undefined,
                made: undefined,
                processes: workspace.processes.map(({ store: _, ...process }) => process),
            }),
        );
        const parsed = parseWorkspace(value, inputsFor);

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

describe('replace', () => {
    const minimum = { width: 200, height: 500 };

    it('swaps a window for another program in place, keeping its frame and depth', () => {
        const history = run(fresh(), [
            { kind: 'replace', id: 'sketch-2', program: 'bookmarks', store: null, minimum },
        ]);
        const processes = history.present.processes;
        const index = processes.findIndex(({ id }) => id === 'bookmarks-5');
        const before = fresh().present.processes.findIndex(({ id }) => id === 'sketch-2');

        expect(index).toBe(before);
        expect(processes[index]).toMatchObject({ program: 'bookmarks', store: 'store-1' });
        expect(processes[index]?.frame.width).toBe(640);
        expect(processes.some(({ id }) => id === 'sketch-2')).toBe(false);
    });

    it('binds to a chosen store, or the main one, and grows to the new minimum', () => {
        const main = run(fresh(), [
            {
                kind: 'replace',
                id: 'playhead-4',
                program: 'bookmarks',
                store: 'bookmarks',
                minimum,
            },
        ]);
        const replaced = main.present.processes.find(({ id }) => id === 'bookmarks-5');

        expect(replaced?.store).toBe('bookmarks');
        expect(replaced?.frame.height).toBe(500);
    });

    it('binds a program that keeps no state to its main store', () => {
        const history = run(fresh(), [
            {
                kind: 'replace',
                id: 'timeline-3',
                program: 'tasks',
                store: null,
                minimum: { width: 0, height: 0 },
            },
        ]);

        expect(history.present.processes.find(({ id }) => id === 'tasks-5')?.store).toBe('tasks');
    });

    it('ignores a program that does not exist', () => {
        const history = run(fresh(), [
            { kind: 'replace', id: 'sketch-2', program: 'nope', store: null, minimum },
        ]);

        expect(history.present.processes.map(({ id }) => id)).toEqual(
            fresh().present.processes.map(({ id }) => id),
        );
    });
});

describe('prune-stores', () => {
    it('removes every store no window is bound to', () => {
        const history = run(fresh(), [
            { kind: 'launch', program: 'bookmarks', size: { width: 300, height: 300 }, viewport },
            { kind: 'add-store', id: 'bookmarks-5', copy: false },
            { kind: 'add-store', id: 'bookmarks-5', copy: false },
            { kind: 'prune-stores', followed: new Map() },
        ]);

        expect(history.present.stores.map(({ id }) => id).sort()).toEqual(
            ['formula-1', 'playhead', 'sketch-2', 'store-2', 'timeline'].sort(),
        );
    });
});

describe('resizing an attached edge', () => {
    const box = (id: string, x: number, y: number, width: number, height: number) => ({
        id,
        program: 'todo' as const,
        store: 'todo',
        follows: {},
        frame: { x, y, width, height, z: 0 },
        measured: { width, height },
    });
    // a | b | c in a row, d under a.
    const attached = (): History => ({
        present: {
            ...defaultWorkspace(viewport, inputsFor),
            processes: [
                box('a', 0, 0, 200, 200),
                box('b', 200, 0, 200, 200),
                box('c', 400, 0, 200, 200),
                box('d', 0, 200, 200, 200),
            ],
            links: [
                { a: 'a', b: 'b' },
                { a: 'b', b: 'c' },
                { a: 'a', b: 'd' },
            ],
        },
    });
    const resize = (edge: 'e' | 'w' | 's' | 'se', dx: number, dy: number): WorkspaceAction => ({
        kind: 'resize',
        id: 'a',
        edge,
        dx,
        dy,
        minimum: { width: 100, height: 100 },
    });
    const xs = (history: History) =>
        Object.fromEntries(
            history.present.processes.map(({ id, frame }) => [id, [frame.x, frame.y, frame.width]]),
        );

    it('pushes the windows attached on that edge, and everything linked on from them', () => {
        const history = run(attached(), [resize('e', 50, 0)]);

        expect(xs(history)).toEqual({
            a: [0, 0, 250],
            b: [250, 0, 200],
            c: [450, 0, 200],
            d: [0, 200, 200],
        });
        expect(history.present.links).toHaveLength(3);
    });

    it('pulls them back when the edge shrinks', () => {
        expect(xs(run(attached(), [resize('e', -60, 0)])).b).toEqual([140, 0, 200]);
    });

    it('leaves windows on the other sides where they are', () => {
        const history = run(attached(), [resize('s', 0, 40)]);

        expect(xs(history)).toMatchObject({ b: [200, 0, 200], d: [0, 240, 200] });
        expect(history.present.links).toHaveLength(3);
    });

    it('carries both sides at a corner, each along its own axis', () => {
        expect(xs(run(attached(), [resize('se', 30, 20)]))).toMatchObject({
            b: [230, 0, 200],
            d: [0, 220, 200],
        });
    });

    it('stops pushing where the window stops growing', () => {
        expect(xs(run(attached(), [resize('e', -500, 0)])).b).toEqual([100, 0, 200]);
    });
});

describe('snapping while resizing', () => {
    const box = (id: string, x: number, y: number, width: number, height: number) => ({
        id,
        program: 'todo' as const,
        store: 'todo',
        follows: {},
        frame: { x, y, width, height, z: 0 },
        measured: { width, height },
    });
    const start = (
        processes: ReturnType<typeof box>[],
        links: { a: string; b: string }[] = [],
    ): History => ({ present: { ...defaultWorkspace(viewport, inputsFor), processes, links } });
    const resize = (
        id: string,
        edge: 'e' | 's' | 'se',
        dx: number,
        dy: number,
    ): WorkspaceAction => ({
        kind: 'resize',
        id,
        edge,
        dx,
        dy,
        minimum: { width: 100, height: 100 },
    });
    const frameOf = (history: History, id: string) =>
        history.present.processes.find(process => process.id === id)?.frame;

    it('lines a bottom edge up with a neighbour that is beside it but not linked', () => {
        const history = run(start([box('a', 0, 0, 200, 200), box('b', 200, 0, 200, 300)]), [
            { kind: 'raise', id: 'a' },
            resize('a', 's', 0, 94),
        ]);

        expect(frameOf(history, 'a')?.height).toBe(300);
    });

    it('lines up with a window a few pixels away, as a move would', () => {
        const history = run(start([box('a', 0, 0, 200, 200), box('b', 206, 0, 200, 400)]), [
            { kind: 'raise', id: 'a' },
            resize('a', 's', 0, 195),
        ]);

        expect(frameOf(history, 'a')?.height).toBe(400);
    });

    it('still snaps the other edge of a window attached on several sides', () => {
        // a has b to its right and c below; resizing a's bottom lines up with b's.
        const history = run(
            start(
                [box('a', 0, 0, 200, 200), box('b', 200, 0, 200, 260), box('c', 0, 200, 200, 200)],
                [
                    { a: 'a', b: 'b' },
                    { a: 'a', b: 'c' },
                ],
            ),
            [{ kind: 'raise', id: 'a' }, resize('a', 's', 0, 56)],
        );

        expect(frameOf(history, 'a')?.height).toBe(260);
        expect(frameOf(history, 'c')?.y).toBe(260);
    });

    it('never snaps to a window it is carrying along', () => {
        const history = run(
            start(
                [box('a', 0, 0, 200, 200), box('b', 200, 0, 200, 200), box('c', 400, 0, 100, 200)],
                [
                    { a: 'a', b: 'b' },
                    { a: 'b', b: 'c' },
                ],
            ),
            [{ kind: 'raise', id: 'a' }, resize('a', 'e', 4, 0)],
        );

        expect(frameOf(history, 'a')?.width).toBe(204);
        expect(frameOf(history, 'c')?.x).toBe(404);
    });

    it('snaps a corner on both axes, each to its own neighbour', () => {
        // As the corner grows, b comes up beside it and c just below it.
        const history = run(
            start([
                box('a', 0, 0, 200, 200),
                box('b', 302, 0, 100, 250),
                box('c', 0, 254, 296, 100),
            ]),
            [{ kind: 'raise', id: 'a' }, resize('a', 'se', 93, 46)],
        );

        expect(frameOf(history, 'a')).toMatchObject({ width: 296, height: 250 });
    });

    it('lets go once pulled further than the reach', () => {
        const history = run(start([box('a', 0, 0, 200, 200), box('b', 200, 0, 200, 300)]), [
            { kind: 'raise', id: 'a' },
            resize('a', 's', 0, 96),
            resize('a', 's', 0, 30),
        ]);

        expect(frameOf(history, 'a')?.height).toBe(326);
    });
});

describe('following', () => {
    const launchTimeline: WorkspaceAction = {
        kind: 'launch',
        program: 'timeline',
        size: { width: 300, height: 140 },
        viewport,
    };
    const processOf = (history: History, id: string) =>
        history.present.processes.find(process => process.id === id);
    // timeline-5 splits off its own clock, store-1, which sketch-2 then follows.
    const twoClocks = (): History =>
        run(fresh(), [
            launchTimeline,
            { kind: 'add-store', id: 'timeline-5', copy: true },
            {
                kind: 'follow',
                id: 'sketch-2',
                input: 'playback',
                source: 'playback',
                store: 'store-1',
            },
        ]);

    it('lets a sketch follow another clock, and the dial too', () => {
        const history = run(twoClocks(), [
            {
                kind: 'follow',
                id: 'playhead-4',
                input: 'progress',
                source: 'playback',
                store: 'store-1',
            },
        ]);

        expect(processOf(history, 'sketch-2')?.follows).toEqual({
            playback: { kind: 'playback', store: 'store-1' },
        });
        expect(processOf(history, 'playhead-4')?.follows).toEqual({
            progress: { kind: 'playback', store: 'store-1' },
        });
    });

    it('refuses what a program does not follow, or another program’s store', () => {
        const history = run(twoClocks(), [
            {
                kind: 'follow',
                id: 'formula-1',
                input: 'playback',
                source: 'playback',
                store: 'store-1',
            },
            {
                kind: 'follow',
                id: 'sketch-2',
                input: 'playback',
                source: 'playback',
                store: 'formula-1',
            },
        ]);

        expect(processOf(history, 'formula-1')?.follows).toEqual({});
        expect(processOf(history, 'sketch-2')?.follows).toEqual({
            playback: { kind: 'playback', store: 'store-1' },
        });
    });

    it('keeps a followed clock when no timeline shows it, through a prune too', () => {
        const history = run(twoClocks(), [
            { kind: 'bind-store', id: 'timeline-5', store: 'timeline' },
            { kind: 'prune-stores', followed: new Map() },
        ]);

        expect(history.present.stores.some(({ id }) => id === 'store-1')).toBe(true);
    });

    it('is labelled by what it follows', () => {
        expect(
            labelOf(
                {
                    kind: 'follow',
                    id: 'sketch-2',
                    input: 'playback',
                    source: 'playback',
                    store: 'store-1',
                },
                twoClocks().present,
            ),
        ).toBe('Set sketch playback to follow Store 1');
    });

    it('is saved and read back, dropping what the program cannot follow', () => {
        const saved: unknown = JSON.parse(JSON.stringify(twoClocks().present));
        const parsed = parseWorkspace(saved, inputsFor);

        expect(parsed?.processes.find(({ id }) => id === 'sketch-2')?.follows).toEqual({
            playback: { kind: 'playback', store: 'store-1' },
        });
    });
});

describe('follows saved before kinds', () => {
    it('read a timeline follow as a playback binding to the same store', () => {
        const workspace = run(fresh(), [
            { kind: 'launch', program: 'timeline', size: { width: 300, height: 140 }, viewport },
            { kind: 'add-store', id: 'timeline-5', copy: true },
        ]).present;
        const saved: unknown = JSON.parse(
            JSON.stringify({
                ...workspace,
                processes: workspace.processes.map(process =>
                    process.id === 'sketch-2'
                        ? { ...process, follows: [{ program: 'timeline', store: 'store-1' }] }
                        : process,
                ),
            }),
        );

        expect(
            parseWorkspace(saved, inputsFor)?.processes.find(({ id }) => id === 'sketch-2')
                ?.follows,
        ).toEqual({ playback: { kind: 'playback', store: 'store-1' } });
    });
});

describe('pruning signal chains', () => {
    it('keeps a signal store that only another followed signal follows', () => {
        const history = run(fresh(), [
            { kind: 'launch', program: 'signal', size: { width: 300, height: 300 }, viewport },
            { kind: 'add-store', id: 'signal-5', copy: false },
            { kind: 'follow', id: 'sketch-2', input: 'k1', source: 'signal', store: 'store-1' },
        ]);
        const followed = new Map([
            [
                'store-1',
                { ...defaultSignal, sources: { phase: null, offset: null, depth: 'signal' } },
            ],
        ]);
        const kept = (map: typeof followed) =>
            reduceWorkspace(
                history.present,
                { kind: 'prune-stores', followed: map },
                inputsFor,
            ).stores.map(({ id }) => id);

        expect(kept(followed)).toContain('signal');
        expect(kept(new Map())).not.toContain('signal');
        expect(kept(new Map())).toContain('store-1');
    });
});

describe('knob inputs', () => {
    const signalled = (): History =>
        run(fresh(), [
            { kind: 'launch', program: 'signal', size: { width: 300, height: 300 }, viewport },
            { kind: 'follow', id: 'sketch-2', input: 'k2', source: 'signal', store: 'signal' },
        ]);
    const sketchOf = (history: History) =>
        history.present.processes.find(({ id }) => id === 'sketch-2')?.follows;

    it('start unbound and follow a signal when asked', () => {
        expect(sketchOf(fresh())).toEqual({ playback: { kind: 'playback', store: 'timeline' } });
        expect(sketchOf(signalled())).toEqual({
            playback: { kind: 'playback', store: 'timeline' },
            k2: { kind: 'signal', store: 'signal' },
        });
    });

    it('let go of a knob, but never of the clock', () => {
        const history = run(signalled(), [
            { kind: 'unfollow', id: 'sketch-2', input: 'k2' },
            { kind: 'unfollow', id: 'sketch-2', input: 'playback' },
        ]);

        expect(sketchOf(history)).toEqual({ playback: { kind: 'playback', store: 'timeline' } });
        expect(
            labelOf({ kind: 'unfollow', id: 'sketch-2', input: 'k2' }, signalled().present),
        ).toBe('Set sketch k2 to follow nothing');
    });

    it('refuse a clock on a knob and a signal on the clock', () => {
        const history = run(signalled(), [
            { kind: 'follow', id: 'sketch-2', input: 'k1', source: 'playback', store: 'timeline' },
            {
                kind: 'follow',
                id: 'sketch-2',
                input: 'playback',
                source: 'signal',
                store: 'signal',
            },
        ]);

        expect(sketchOf(history)).toEqual(sketchOf(signalled()));
    });

    it('keep a followed signal in use, and read it back after a reload', () => {
        const history = signalled();

        expect(usedStores(history.present.processes).has('signal')).toBe(true);
        expect(
            parseWorkspace(JSON.parse(JSON.stringify(history.present)), inputsFor)?.processes,
        ).toEqual(history.present.processes);
    });
});

describe('focus progress bindings', () => {
    it('lets a sketch follow playback only, and programs with no inputs follow nothing', () => {
        const history = run(fresh(), [
            { kind: 'launch', program: 'focus', size: { width: 260, height: 340 }, viewport },
            { kind: 'follow', id: 'sketch-2', input: 'playback', source: 'focus', store: 'focus' },
            {
                kind: 'follow',
                id: 'formula-1',
                input: 'playback',
                source: 'playback',
                store: 'timeline',
            },
        ]);
        const followsOf = (id: string) =>
            history.present.processes.find(process => process.id === id)?.follows;

        expect(followsOf('sketch-2')).toEqual({
            playback: { kind: 'playback', store: 'timeline' },
        });
        expect(followsOf('formula-1')).toEqual({});
    });
    const focus = (): History =>
        run(fresh(), [
            { kind: 'launch', program: 'focus', size: { width: 260, height: 340 }, viewport },
            { kind: 'add-store', id: 'focus-5', copy: true },
            {
                kind: 'follow',
                id: 'playhead-4',
                input: 'progress',
                source: 'focus',
                store: 'store-1',
            },
        ]);

    it('replaces playback with focus as the dial’s single progress source', () => {
        const history = focus();
        expect(history.present.processes.find(({ id }) => id === 'playhead-4')?.follows).toEqual({
            progress: { kind: 'focus', store: 'store-1' },
        });
        const back = run(history, [
            {
                kind: 'follow',
                id: 'playhead-4',
                input: 'progress',
                source: 'playback',
                store: 'timeline',
            },
        ]);
        expect(back.present.processes.find(({ id }) => id === 'playhead-4')?.follows).toEqual({
            progress: { kind: 'playback', store: 'timeline' },
        });
    });

    it('retains a followed focus store after its editor closes, including prune and delete', () => {
        const history = run(focus(), [
            { kind: 'quit', id: 'focus-5' },
            { kind: 'prune-stores', followed: new Map() },
            { kind: 'remove-store', id: 'playhead-4', store: 'store-1' },
        ]);
        expect(usedStores(history.present.processes).has('store-1')).toBe(true);
        expect(history.present.stores.some(({ id }) => id === 'store-1')).toBe(true);
    });

    it('does not make a focus dial use the default playback store', () => {
        const history = run(focus(), [
            { kind: 'quit', id: 'sketch-2' },
            { kind: 'quit', id: 'timeline-3' },
        ]);
        expect(usedStores(history.present.processes).has('timeline')).toBe(false);
    });

    it('rejects unsupported sources and a valid kind naming the wrong document', () => {
        const history = run(focus(), [
            {
                kind: 'follow',
                id: 'sketch-2',
                input: 'playback',
                source: 'focus',
                store: 'store-1',
            },
            {
                kind: 'follow',
                id: 'playhead-4',
                input: 'progress',
                source: 'focus',
                store: 'timeline',
            },
            {
                kind: 'follow',
                id: 'playhead-4',
                input: 'progress',
                source: 'board',
                store: 'store-1',
            },
            {
                kind: 'follow',
                id: 'playhead-4',
                input: 'progress',
                source: 'focus',
                store: 'missing',
            },
        ]);
        expect(history.present.processes).toEqual(focus().present.processes);
    });

    it('round-trips focus bindings and drops forged references without losing the workspace', () => {
        const workspace = focus().present;
        expect(parseWorkspace(JSON.parse(JSON.stringify(workspace)), inputsFor)?.processes).toEqual(
            workspace.processes,
        );
        const broken = {
            ...workspace,
            processes: workspace.processes.map(process =>
                process.id === 'playhead-4'
                    ? { ...process, follows: [{ kind: 'focus', store: 'timeline' }] }
                    : process,
            ),
        };
        const parsed = parseWorkspace(broken, inputsFor);
        expect(parsed?.processes).toHaveLength(workspace.processes.length);
        // A forged binding falls back to where a new dial starts, not to following nothing.
        expect(parsed?.processes.find(({ id }) => id === 'playhead-4')?.follows).toEqual({
            progress: { kind: 'playback', store: 'timeline' },
        });
    });
});
