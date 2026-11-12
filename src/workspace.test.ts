import { describe, expect, it } from 'vitest';
import {
    boxOf,
    defaultWorkspace,
    listed,
    seamBetween,
    seamsOf,
    labelOf,
    parseWorkspace,
    reduceWorkspace,
    settledAction,
    usedStores,
    type Workspace,
    type WorkspaceAction,
    onScreen,
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

describe('on screen', () => {
    const viewport = { width: 800, height: 600 };

    it('counts a window in view or within the margin, at any zoom', () => {
        const box = (x: number, y: number) => ({ x, y, width: 100, height: 100 });

        expect(onScreen(box(300, 200), { x: 0, y: 0, zoom: 1 }, viewport)).toBe(true);
        expect(onScreen(box(850, 200), { x: 0, y: 0, zoom: 1 }, viewport)).toBe(true);
        expect(onScreen(box(1000, 200), { x: 0, y: 0, zoom: 1 }, viewport)).toBe(false);
        expect(onScreen(box(-300, 200), { x: 0, y: 0, zoom: 1 }, viewport)).toBe(false);
        expect(onScreen(box(1000, 200), { x: 0, y: 0, zoom: 0.5 }, viewport)).toBe(true);
        expect(onScreen(box(1000, 200), { x: -900, y: 0, zoom: 1 }, viewport)).toBe(true);
    });
});

describe('launch placement', () => {
    const launch = {
        kind: 'launch',
        program: 'bookmarks',
        size: { width: 300, height: 300 },
        viewport,
    } as const satisfies WorkspaceAction;

    it.each([0.1, 0.5, 1, 2, 4])('centres every launch at zoom %s after panning', zoom => {
        const camera = { x: -800, y: 420, zoom };
        const workspace = { ...fresh().present, camera };
        const process = reduceWorkspace(workspace, launch, inputsFor).processes.at(-1);

        expect(process).toBeDefined();
        if (process === undefined) return;
        expect(process.frame.x * zoom + camera.x).toBeCloseTo(550);
        expect(process.frame.y * zoom + camera.y).toBeCloseTo(300);
        expect(process.frame.width * zoom).toBeCloseTo(300);
        expect(process.frame.height * zoom).toBeCloseTo(300);
        expect(process.measured).toEqual({
            width: process.frame.width,
            height: process.frame.height,
        });
        const next = reduceWorkspace(workspace, launch, inputsFor);
        expect(reduceWorkspace(next, launch, inputsFor).processes.at(-1)?.frame).toEqual(
            process.frame,
        );
    });

    it('fits a large program inside the visible viewport, including its offset', () => {
        const camera = { x: 200, y: -80, zoom: 2 };
        const workspace = { ...fresh().present, camera };
        const process = reduceWorkspace(
            workspace,
            {
                ...launch,
                size: { width: 920, height: 640 },
                viewport: { width: 360, height: 300, left: 50, top: 120 },
            },
            inputsFor,
        ).processes.at(-1);

        expect(process?.frame).toEqual({ x: -65, y: 110, width: 160, height: 130, z: 0 });
    });

    it('replays a launch in its captured view while preserving the current camera', () => {
        const workspace = { ...fresh().present, camera: { x: -800, y: 420, zoom: 0.5 } };
        const action = settledAction(workspace, launch);
        const expected = reduceWorkspace(workspace, action, inputsFor).processes.at(-1);
        const replayed = reduceWorkspace(fresh().present, action, inputsFor);

        expect(replayed.processes.at(-1)?.frame).toEqual(expected?.frame);
        expect(replayed.camera).toEqual(fresh().present.camera);
    });
});

describe('moving a selection', () => {
    const initial = defaultWorkspace(viewport, inputsFor);
    const workspace = {
        ...initial,
        camera: { x: 50, y: -20, zoom: 0.5 },
        links: [],
        processes: initial.processes.map((process, i) => ({
            ...process,
            frame: { x: i * 400, y: 0, z: 0, width: 200, height: 200 },
            measured: { width: 200, height: 200 },
        })),
    };
    const ids = workspace.processes.map(p => p.id);
    const first = ids[0] ?? '';
    const second = ids[1] ?? '';
    const third = ids[2] ?? '';
    const selected = [first, second];
    const move: WorkspaceAction = { kind: 'move', id: first, dx: 50, dy: 30, selected };
    const frames = (state: Workspace) =>
        Object.fromEntries(state.processes.map(p => [p.id, p.frame]));

    it('moves selected windows by the same world delta and leaves others in place', () => {
        const next = frames(reduceWorkspace(workspace, move, inputsFor));
        workspace.processes.forEach(process => {
            expect(next[process.id]).toEqual(
                selected.includes(process.id)
                    ? { ...process.frame, x: process.frame.x + 100, y: 60 }
                    : process.frame,
            );
        });
    });

    it('raises the selection together with the grabbed window on top', () => {
        const next = reduceWorkspace(workspace, { kind: 'raise', id: first, selected }, inputsFor);
        expect(next.processes.map(p => p.id)).toEqual([...ids.slice(2), second, first]);
    });

    it('moves an unselected window independently', () => {
        const next = frames(reduceWorkspace(workspace, { ...move, id: third }, inputsFor));
        expect(next[first]).toEqual(frames(workspace)[first]);
        expect(next[second]).toEqual(frames(workspace)[second]);
        expect(next[third]?.x).toBe(900);
    });

    it('snaps the whole selection by one offset, keeping its spacing', () => {
        const next = frames(reduceWorkspace(workspace, { ...move, dx: 97, dy: 0 }, inputsFor));
        expect(next[first]?.x).toBe(200);
        expect(next[second]?.x).toBe(600);
        expect((next[second]?.x ?? 0) - (next[first]?.x ?? 0)).toBe(400);
    });

    it('carries attached members without moving a member twice', () => {
        const attached = {
            ...workspace,
            processes: workspace.processes.map((p, i) =>
                i === 1 ? { ...p, frame: { ...p.frame, x: 200 } } : p,
            ),
            links: [{ a: first, b: second }],
        };
        const next = frames(reduceWorkspace(attached, move, inputsFor));
        expect(next[first]?.x).toBe(100);
        expect(next[second]?.x).toBe(300);
    });

    it('replays the captured group and zoom after the view changes', () => {
        const action = settledAction(workspace, move);
        const next = reduceWorkspace(
            { ...workspace, camera: { x: 0, y: 0, zoom: 2 } },
            action,
            inputsFor,
        );
        expect(frames(next)).toEqual(frames(reduceWorkspace(workspace, move, inputsFor)));
        expect(next.camera.zoom).toBe(2);
    });
});

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
        expect(parseWorkspace(saved('pieces'), inputsFor)?.processes[0]?.program).toBe(
            'blueprints',
        );
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
        program: 'tickets' as const,
        store: 'tickets',
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
        program: 'tickets' as const,
        store: 'tickets',
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
    it("are the store's, not the window's: a knob follow on a sketch window is refused", () => {
        const history = run(fresh(), [
            { kind: 'launch', program: 'signal', size: { width: 300, height: 300 }, viewport },
            { kind: 'follow', id: 'sketch-2', input: 'k2', source: 'signal', store: 'signal' },
        ]);

        expect(history.present.processes.find(({ id }) => id === 'sketch-2')?.follows).toEqual({
            playback: { kind: 'playback', store: 'timeline' },
        });
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
            { kind: 'launch', program: 'progress', size: { width: 300, height: 130 }, viewport },
            {
                kind: 'follow',
                id: 'progress-6',
                input: 'source',
                source: 'focus',
                store: 'store-1',
            },
        ]);
    const followsOf = (history: History, id: string) =>
        history.present.processes.find(process => process.id === id)?.follows;

    it('starts a progress bar on the main focus timer and switches it to an agenda', () => {
        expect(followsOf(focus(), 'progress-6')).toEqual({
            source: { kind: 'focus', store: 'store-1' },
        });
        const agenda = run(focus(), [
            {
                kind: 'follow',
                id: 'progress-6',
                input: 'source',
                source: 'agenda',
                store: 'agenda',
            },
        ]);
        expect(followsOf(agenda, 'progress-6')).toEqual({
            source: { kind: 'agenda', store: 'agenda' },
        });
    });

    it('lets a dial follow playback only', () => {
        const history = run(focus(), [
            {
                kind: 'follow',
                id: 'playhead-4',
                input: 'progress',
                source: 'focus',
                store: 'store-1',
            },
        ]);
        expect(followsOf(history, 'playhead-4')).toEqual({
            progress: { kind: 'playback', store: 'timeline' },
        });
    });

    it('retains a followed focus store after its editor closes, including prune and delete', () => {
        const history = run(focus(), [
            { kind: 'quit', id: 'focus-5' },
            { kind: 'prune-stores', followed: new Map() },
            { kind: 'remove-store', id: 'progress-6', store: 'store-1' },
        ]);
        expect(usedStores(history.present.processes).has('store-1')).toBe(true);
        expect(history.present.stores.some(({ id }) => id === 'store-1')).toBe(true);
    });

    it('does not make a progress bar use the default playback store', () => {
        const history = run(focus(), [
            { kind: 'quit', id: 'sketch-2' },
            { kind: 'quit', id: 'timeline-3' },
            { kind: 'quit', id: 'playhead-4' },
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
                id: 'progress-6',
                input: 'source',
                source: 'agenda',
                store: 'timeline',
            },
            {
                kind: 'follow',
                id: 'progress-6',
                input: 'source',
                source: 'tickets',
                store: 'store-1',
            },
            {
                kind: 'follow',
                id: 'progress-6',
                input: 'source',
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
                process.id === 'progress-6'
                    ? { ...process, follows: [{ kind: 'focus', store: 'timeline' }] }
                    : process,
            ),
        };
        const parsed = parseWorkspace(broken, inputsFor);
        expect(parsed?.processes).toHaveLength(workspace.processes.length);
        // A forged binding falls back to where a new progress bar starts, not to following nothing.
        expect(parsed?.processes.find(({ id }) => id === 'progress-6')?.follows).toEqual({
            source: { kind: 'focus', store: 'focus' },
        });
    });
});

describe('drawn sections', () => {
    it('keeps an explicit world rectangle when the camera changes', () => {
        const rect = { x: -100, y: 50, width: 480, height: 260 };
        const before = {
            ...defaultWorkspace(viewport, inputsFor),
            camera: { x: 200, y: -80, zoom: 0.5 },
        };
        const after = reduceWorkspace(
            before,
            { kind: 'add-section', viewport, rect },
            inputsFor,
            42,
        );
        expect(after.sections.at(-1)).toEqual({
            id: 'section-42',
            name: 'Section 1',
            rects: [rect],
        });
        expect(after.processes).toEqual(before.processes);
    });
});

it('migrates overlapping legacy section rectangles without touching programs', () => {
    const before = defaultWorkspace(viewport, inputsFor);
    const parsed = parseWorkspace(
        {
            ...before,
            sections: [
                {
                    id: 'first',
                    name: 'First',
                    rect: { x: 0, y: 0, width: 300, height: 300 },
                },
                {
                    id: 'second',
                    name: 'Second',
                    rect: { x: 200, y: 200, width: 300, height: 300 },
                },
            ],
        },
        inputsFor,
    );
    expect(parsed?.sections).toHaveLength(1);
    expect(parsed?.sections[0]).toMatchObject({ id: 'first', name: 'First' });
    expect(parsed?.processes).toEqual(before.processes);
    expect(parseWorkspace(JSON.parse(JSON.stringify(parsed)), inputsFor)?.sections).toEqual(
        parsed?.sections,
    );
});

it('erases an area without changing any programs and refuses an empty erasure', () => {
    const before = reduceWorkspace(
        defaultWorkspace(viewport, inputsFor),
        {
            kind: 'add-section',
            viewport,
            rect: { x: 0, y: 0, width: 500, height: 500 },
        },
        inputsFor,
        10,
    );
    const empty = reduceWorkspace(
        before,
        { kind: 'erase-sections', rect: { x: 800, y: 800, width: 20, height: 20 } },
        inputsFor,
        11,
    );
    expect(empty).toBe(before);
    const cut = reduceWorkspace(
        before,
        {
            kind: 'erase-sections',
            rect: { x: 200, y: -10, width: 100, height: 520 },
        },
        inputsFor,
        12,
    );
    expect(cut.sections).toHaveLength(2);
    expect(cut.processes).toBe(before.processes);
});

describe('many windows', () => {
    // A seeded layout of boxes on a coarse grid, so touching, overlapping and far-apart pairs all occur.
    const layout = (count: number, seed: number): Workspace => {
        const random = (n: number) => {
            const x = Math.sin(seed * 9301 + n * 49297) * 233280;

            return x - Math.floor(x);
        };
        const base = defaultWorkspace(viewport, inputsFor);
        const processes = Array.from({ length: count }, (_, index) => {
            const width = 40 + Math.floor(random(index * 4) * 4) * 40;
            const height = 40 + Math.floor(random(index * 4 + 1) * 4) * 40;
            const frame = {
                x: Math.floor(random(index * 4 + 2) * 12) * 40,
                y: Math.floor(random(index * 4 + 3) * 12) * 40,
                z: 0,
                width,
                height,
            };

            return {
                id: `progress-${index}`,
                program: 'progress' as const,
                store: 'progress',
                follows: { source: { kind: 'focus' as const, store: 'focus' } },
                frame,
                measured: { width, height },
            };
        });

        return {
            ...base,
            processes,
            links: [{ a: 'progress-0', b: 'progress-1' }],
        };
    };

    const allPairs = ({ processes, links }: Workspace) =>
        processes.flatMap((first, index) =>
            processes.slice(index + 1).flatMap(second => {
                const seam = seamBetween(boxOf(first), boxOf(second));

                return seam === null
                    ? []
                    : [
                          {
                              a: first.id,
                              b: second.id,
                              ...seam,
                              linked: links.some(
                                  ({ a, b }) =>
                                      (a === first.id && b === second.id) ||
                                      (a === second.id && b === first.id),
                              ),
                          },
                      ];
            }),
        );

    it('finds exactly the seams a check of every pair finds, in the same order', () => {
        const found = [1, 2, 3, 4, 5].map(seed => {
            const workspace = layout(60, seed);

            expect(seamsOf(workspace)).toEqual(allPairs(workspace));

            return allPairs(workspace).length;
        });

        expect(Math.min(...found)).toBeGreaterThan(5);
    });

    it('numbers each program in launch order', () => {
        const ordinals = listed(layout(9, 7).processes).map(({ ordinal }) => ordinal);

        expect(ordinals).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
});
