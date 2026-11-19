import type { Linked } from './shared/signal.ts';
import { unlinkedSketch } from './model/sketch/links.ts';
import { describe, expect, it } from 'vitest';
import {
    defaultMode,
    reduceMode,
    wiringOf,
    defaultSession,
    reduceSession,
    modeOf,
    reduceEngaged,
    disengaged,
    type EngageAction,
    type Engaged,
} from './state-mode.ts';
import {
    anchorOf,
    commandFor,
    connectionOf,
    groupKey,
    selectionOf,
    sameWiring,
    sparkOf,
    windowOfGroup,
} from './components/state-wiring/wiring.ts';
import { inputsFor } from './declarations.ts';
import { defaultSignal } from './shared/signal.ts';
import { defaultWorkspace, reduceWorkspace, type WorkspaceAction } from './workspace.ts';
import { tracedOf } from './why.ts';

const viewport = { width: 1400, height: 900 };
const run = (actions: readonly WorkspaceAction[] = []) =>
    actions.reduce(
        (workspace, action) => reduceWorkspace(workspace, action, inputsFor),
        defaultWorkspace(viewport, inputsFor),
    );
const active = { active: true };
const on = { ...defaultSession, pinned: active };
const launch: WorkspaceAction = {
    kind: 'launch',
    program: 'signal',
    size: { width: 300, height: 300 },
    viewport,
};

describe('state mode', () => {
    it.each([1, 1.25, 2])('keeps touch rows separated and anchors centred at scale %s', unit => {
        const workspace = run([launch]);
        const view = wiringOf(workspace, new Map(), inputsFor, on, unit, true);
        if (view === null) throw new Error('Missing wiring view');

        expect(view.rowHeight).toBe(44 * unit);
        for (const socket of view.sockets) {
            expect(anchorOf(socket, unit, view.rowHeight).y).toBe(socket.y + 22 * unit);
            const following = view.sockets.find(
                other =>
                    other.window === socket.window &&
                    other.end.kind === socket.end.kind &&
                    other.y > socket.y,
            );
            if (following !== undefined) {
                expect(following.y - socket.y).toBeGreaterThanOrEqual(view.rowHeight);
            }
        }
        expect(sameWiring(view, { ...view, rowHeight: view.rowHeight + 1 })).toBe(false);
    });
    it('puts the jacks of a window too small for its rows on its edges', () => {
        const nand = run([{ ...launch, program: 'nand', size: { width: 184, height: 64 } }]);
        const view = wiringOf(nand, new Map(), inputsFor, on, 1);
        const gate = nand.processes.at(-1);
        if (view === null || gate === undefined) throw new Error('Missing wiring view');
        const mine = view.sockets.filter(socket => socket.window === gate.id);
        const { x, width } = gate.frame;

        expect(mine.map(socket => socket.title)).toEqual([
            'Output',
            'Playback',
            'a',
            'b',
            'read on',
        ]);
        mine.forEach(socket => {
            expect(anchorOf(socket, 1).x).toBe(socket.end.kind === 'store' ? x + width : x);
        });
    });

    it('holds temporary mode until every active interaction finishes', () => {
        const held = reduceSession(defaultSession, { kind: 'hold', held: true });
        expect(modeOf(held).active).toBe(true);
        const dragging = reduceSession(held, { kind: 'busy', key: 'drag', busy: true });
        const released = reduceSession(dragging, { kind: 'hold', held: false });
        expect(modeOf(released).active).toBe(true);
        const selecting = reduceSession(released, { kind: 'busy', key: 'selector', busy: true });
        const dropped = reduceSession(selecting, { kind: 'busy', key: 'drag', busy: false });
        expect(modeOf(dropped).active).toBe(true);
        expect(
            modeOf(reduceSession(dropped, { kind: 'busy', key: 'selector', busy: false })).active,
        ).toBe(false);
    });

    it('pins temporary mode with the toggle and cancels holds on Escape or focus loss', () => {
        const held = reduceSession(defaultSession, { kind: 'hold', held: true });
        const pinned = reduceSession(held, { kind: 'toggle' });
        expect(modeOf(reduceSession(pinned, { kind: 'hold', held: false })).active).toBe(true);
        expect(modeOf(reduceSession(held, { kind: 'blur' })).active).toBe(false);
        expect(modeOf(reduceSession(pinned, { kind: 'blur' })).active).toBe(true);
        expect(reduceSession(pinned, { kind: 'close' })).toEqual(defaultSession);
    });

    it('keeps the mode on through a menu lock, and lets go when its window closes', () => {
        const held = reduceSession(defaultSession, { kind: 'hold', held: true });
        const selecting = reduceSession(
            reduceSession(held, { kind: 'busy', key: 'menu:signal-5', busy: true }),
            { kind: 'hold', held: false },
        );
        expect(modeOf(selecting).active).toBe(true);
        expect(modeOf(reduceSession(selecting, { kind: 'windows', ids: [] })).active).toBe(false);
    });

    it('lets only a drag start the mode, so one tab opened outside it stays local', () => {
        const picking = reduceSession(defaultSession, {
            kind: 'busy',
            key: 'selector',
            busy: true,
        });
        const dragging = reduceSession(defaultSession, { kind: 'busy', key: 'drag', busy: true });

        expect(modeOf(picking).active).toBe(false);
        expect(modeOf(dragging).active).toBe(true);
    });

    it('puts every jack on the edge of its window, inputs left and outputs right, below the title', () => {
        const workspace = run([launch]);
        const view = wiringOf(workspace, new Map(), inputsFor, on, 1);
        expect(view).not.toBeNull();
        view?.sockets
            .filter(socket => !socket.hidden)
            .forEach(socket => {
                const frame = workspace.processes.find(
                    process => process.id === socket.window,
                )?.frame;
                if (frame === undefined) throw new Error('Missing window');
                const jack = anchorOf(socket, 1);
                expect(jack.x).toBe(socket.side === 'left' ? frame.x : frame.x + frame.width);
                expect(socket.side).toBe(socket.end.kind === 'store' ? 'right' : 'left');
                expect(socket.y).toBeGreaterThanOrEqual(frame.y + 36);
            });
    });
    it('stays on until closed or toggled off', () => {
        const entered = reduceMode(defaultMode, { kind: 'enter' });
        expect(entered).toEqual(active);
        expect(reduceMode(entered, { kind: 'enter' })).toEqual(active);
        expect(reduceMode(entered, { kind: 'close' })).toEqual(defaultMode);
        expect(reduceMode(entered, { kind: 'toggle' })).toEqual(defaultMode);
        expect(reduceMode(defaultMode, { kind: 'toggle' })).toEqual(active);
    });

    it('draws no ports when closed and keeps the mode independent of window focus', () => {
        expect(wiringOf(run(), new Map(), inputsFor, defaultSession, 1)).toBeNull();
        const before = wiringOf(run(), new Map(), inputsFor, on, 1);
        const after = wiringOf(
            run([{ kind: 'raise', id: 'formula-1' }]),
            new Map(),
            inputsFor,
            on,
            1,
        );
        expect(after?.sockets.length).toBe(before?.sockets.length);
    });

    it('draws one clock wire to each follower and no duplicate shared-state wire', () => {
        const view = wiringOf(run(), new Map(), inputsFor, on, 1);
        expect(view?.wires).toHaveLength(2);
        const shared = wiringOf(run([launch, launch]), new Map(), inputsFor, on, 1);
        expect(shared?.wires.filter(wire => wire.shared)).toHaveLength(1);
    });

    it('keeps selectors intact while signal values change, and updates them when wiring changes', () => {
        const workspace = run([launch]);
        const before = wiringOf(workspace, new Map(), inputsFor, on, 1);
        const edited = wiringOf(
            workspace,
            new Map([['signal', { ...defaultSignal, depth: 2 }]]),
            inputsFor,
            on,
            1,
        );
        expect(sameWiring(before, edited)).toBe(true);
        const renamed = reduceWorkspace(
            workspace,
            { kind: 'rename-store', id: 'signal-5', store: 'signal', name: 'Wave' },
            inputsFor,
        );
        expect(sameWiring(before, wiringOf(renamed, new Map(), inputsFor, on, 1))).toBe(false);
    });

    it('keeps signal connections on the document and excludes sources that would loop', () => {
        const workspace = run([launch, launch, { kind: 'add-store', id: 'signal-6', copy: false }]);
        const signals = new Map([
            [
                'signal',
                { ...defaultSignal, sources: { phase: null, offset: null, depth: 'store-1' } },
            ],
        ]);
        const view = wiringOf(workspace, signals, inputsFor, on, 1);
        const depth = view?.sockets.find(socket => socket.key === 'signal-5:input:depth');
        const source = view?.sockets.find(socket => socket.key === 'signal-6:output');
        const reverse = view?.sockets.find(socket => socket.key === 'signal-6:input:phase');
        const target = view?.sockets.find(socket => socket.key === 'signal-5:output');
        if (
            depth === undefined ||
            source === undefined ||
            reverse === undefined ||
            target === undefined
        )
            throw new Error('Missing sockets');
        expect(connectionOf(source, depth)).toEqual({
            kind: 'source',
            store: 'signal',
            param: 'depth',
            source: 'store-1',
        });
        expect(connectionOf(depth, source)).toEqual(connectionOf(source, depth));
        expect(selectionOf(depth, '')).toEqual({
            kind: 'source',
            store: 'signal',
            param: 'depth',
            source: null,
        });
        expect(connectionOf(target, reverse)).toBeNull();
        expect(selectionOf(depth, 'signal')).toBeNull();
    });

    it('uses the same commands for compact selection and dragging, including hidden sources', () => {
        const view = wiringOf(
            run([
                {
                    kind: 'launch',
                    program: 'progress',
                    size: { width: 300, height: 130 },
                    viewport,
                },
            ]),
            new Map(),
            inputsFor,
            on,
            1,
        );
        const playback = view?.sockets.find(socket => socket.key === 'sketch-2:input:playback');
        const output = view?.sockets.find(socket => socket.key === 'timeline-3:output');
        if (playback === undefined || output === undefined)
            throw new Error('Missing clock sockets');
        expect(selectionOf(playback, 'timeline')).toEqual(connectionOf(output, playback));
        expect(selectionOf(playback, '')).toBeNull();
        expect(commandFor(view, { kind: 'drag', from: output.key, to: playback.key })).toEqual(
            commandFor(view, { kind: 'select', key: playback.key, value: 'timeline' }),
        );
        expect(
            commandFor(null, { kind: 'select', key: playback.key, value: 'timeline' }),
        ).toBeNull();
        const source = view?.sockets.find(socket => socket.key === 'progress-5:input:source');
        if (source === undefined) throw new Error('Missing source socket');
        expect(selectionOf(source, 'agenda')).toEqual({
            kind: 'connect',
            window: 'progress-5',
            input: 'source',
            source: 'agenda',
            store: 'agenda',
        });
    });

    it('allows output sharing only between windows of the same program', () => {
        const view = wiringOf(
            run([launch, launch, { kind: 'add-store', id: 'signal-6', copy: false }]),
            new Map(),
            inputsFor,
            on,
            1,
        );
        const first = view?.sockets.find(socket => socket.key === 'signal-5:output');
        const second = view?.sockets.find(socket => socket.key === 'signal-6:output');
        const clock = view?.sockets.find(socket => socket.key === 'timeline-3:output');
        if (first === undefined || second === undefined || clock === undefined)
            throw new Error('Missing outputs');
        expect(connectionOf(first, second)).toEqual({
            kind: 'bind',
            window: 'signal-6',
            store: 'signal',
        });
        expect(selectionOf(second, 'signal')).toEqual(connectionOf(first, second));
        expect(connectionOf(first, clock)).toBeNull();
        expect(connectionOf(first, first)).toBeNull();
    });
});

describe('tracing why a control moves', () => {
    it('draws only the wires of the path, and the tabs they land on', () => {
        const workspace = run([launch, launch, { kind: 'add-store', id: 'signal-6', copy: false }]);
        const sketch = workspace.processes.find(({ id }) => id === 'sketch-2')?.store ?? '';
        const linked = new Map<string, Linked>([
            ['signal', { sources: { phase: null, offset: null, depth: 'store-1' } }],
            [sketch, { sources: { k1: 'signal' } }],
        ]);
        const traced = tracedOf(workspace.processes, linked, {
            window: 'sketch-2',
            store: sketch,
            input: 'k1',
        });
        const view = wiringOf(
            workspace,
            linked,
            inputsFor,
            defaultSession,
            1,
            false,
            linked,
            new Map(),
            new Map(),
            'curves',
            { hovered: 'timeline-3', focused: 'timeline-3' },
            traced,
        );

        expect([...new Set(view?.sockets.map(socket => socket.window))].sort()).toEqual([
            'signal-5',
            'signal-6',
            'sketch-2',
        ]);
        expect(view?.wires.map(({ from, to }) => [from, to]).sort()).toEqual([
            ['signal-5:output', 'sketch-2:input:k1'],
            ['signal-6:output', 'signal-5:input:depth'],
        ]);
    });
});

describe('tabs outside state mode', () => {
    const keysOf = (view: ReturnType<typeof wiringOf>) =>
        [...new Set((view?.sockets ?? []).map(socket => socket.window))].sort();

    it('draws nothing with no window engaged', () => {
        expect(wiringOf(run(), new Map(), inputsFor, defaultSession, 1)).toBeNull();
    });

    it('peeks the own tabs of a hovered window and draws none of its wires', () => {
        const view = wiringOf(
            run(),
            new Map(),
            inputsFor,
            defaultSession,
            1,
            false,
            new Map(),
            new Map(),
            new Map(),
            'curves',
            { hovered: 'sketch-2', focused: null },
        );

        expect(keysOf(view)).toEqual(['sketch-2']);
        expect(view?.wires).toEqual([]);
        expect(view?.all).toBe(false);
    });

    it('wires a focused window to its neighbours, showing only the tabs its wires land on', () => {
        const view = wiringOf(
            run(),
            new Map(),
            inputsFor,
            defaultSession,
            1,
            false,
            new Map(),
            new Map(),
            new Map(),
            'curves',
            { hovered: null, focused: 'sketch-2' },
        );

        expect(keysOf(view)).toEqual(['sketch-2', 'timeline-3']);
        expect(
            view?.sockets.filter(socket => socket.window === 'timeline-3').map(({ key }) => key),
        ).toEqual(['timeline-3:output']);
        expect(view?.wires.map(({ from, to }) => [from, to])).toEqual([
            ['timeline-3:output', 'sketch-2:input:playback'],
        ]);
    });

    it('folds hover and presses, and lets go of a window that closed', () => {
        const engaged = [
            { kind: 'hover', id: 'a', over: true },
            { kind: 'press', id: 'b' },
            { kind: 'hover', id: 'c', over: false },
            { kind: 'windows', ids: ['b'] },
        ] satisfies EngageAction[];
        const steps = engaged.reduce(
            (seen: Engaged[], action) => [
                ...seen,
                reduceEngaged(seen.at(-1) ?? disengaged, action),
            ],
            [],
        );

        expect(steps).toEqual([
            { hovered: 'a', focused: null },
            { hovered: 'a', focused: 'b' },
            { hovered: 'a', focused: 'b' },
            { hovered: null, focused: 'b' },
        ]);
        expect(reduceEngaged(steps[3] ?? disengaged, { kind: 'press', id: null })).toEqual(
            disengaged,
        );
    });
});

describe('input groups', () => {
    const small: WorkspaceAction = {
        kind: 'launch',
        program: 'sketch',
        size: { width: 320, height: 420 },
        viewport,
    };
    const sketchIn = (workspace: ReturnType<typeof run>) => {
        const process = workspace.processes.at(-1);
        if (process === undefined) throw new Error('No sketch');
        return process;
    };
    const signals = new Map([['signal', defaultSignal]]);

    it('keeps every tab of the smallest sketch outside its face, whichever group is open', () => {
        const workspace = run([small]);
        const sketch = sketchIn(workspace);
        const groups = ['Knobs', 'Camera', 'Look'];

        [null, ...groups].forEach(group => {
            const session = {
                ...on,
                open: group === null ? [] : [groupKey(sketch.id, group)],
            };
            const view = wiringOf(workspace, signals, inputsFor, session, 1);
            const rows = [
                ...(view?.sockets ?? []).filter(
                    socket => socket.window === sketch.id && !socket.hidden,
                ),
                ...(view?.groups ?? []).filter(row => row.window === sketch.id),
            ];

            expect(rows.length).toBeGreaterThan(0);
            rows.forEach(row => {
                if (row.side === 'left') {
                    expect(row.x + row.width).toBeLessThanOrEqual(sketch.frame.x + 10);
                } else {
                    expect(row.x).toBeGreaterThanOrEqual(sketch.frame.x + sketch.frame.width - 10);
                }
                expect(row.y).toBeGreaterThanOrEqual(sketch.frame.y + 36);
            });
        });
    });

    it('lands a closed group’s wires on its own jack, and counts what is bound', () => {
        const workspace = run([small]);
        const sketch = sketchIn(workspace);
        const linked = new Map<string, Linked>([
            ...signals,
            [sketch.store, { sources: { ...unlinkedSketch.sources, k2: 'signal' } }],
        ]);
        const view = wiringOf(workspace, linked, inputsFor, on, 1);
        const knobs = view?.groups.find(row => row.key === groupKey(sketch.id, 'Knobs'));
        const k2 = view?.sockets.find(socket => socket.key === `${sketch.id}:input:k2`);

        expect(knobs).toMatchObject({ open: false, bound: 1, total: 4 });
        expect(k2).toMatchObject({ hidden: true, x: knobs?.x, y: knobs?.y });
        expect(view?.groups.map(row => row.title).filter(Boolean)).toContain('Look');
        expect(
            view?.sockets.some(
                socket => socket.key === `${sketch.id}:input:playback` && !socket.hidden,
            ),
        ).toBe(true);
    });

    it('opens one group per window, lets a drag spring another open, and remembers them', () => {
        const knobs = groupKey('sketch-2', 'Knobs');
        const camera = groupKey('sketch-2', 'Camera');
        const elsewhere = groupKey('sketch-9', 'Look');
        const opened = [
            { kind: 'expand', key: knobs, open: true },
            { kind: 'expand', key: elsewhere, open: true },
            { kind: 'expand', key: camera, open: true },
        ] as const;
        const session = opened.reduce(reduceSession, on);

        expect(session.open).toEqual([elsewhere, camera]);
        expect(reduceSession(session, { kind: 'expand', key: camera, open: false }).open).toEqual([
            elsewhere,
        ]);

        const sprung = reduceSession(session, { kind: 'spring', key: knobs });
        const view = wiringOf(run(), signals, inputsFor, sprung, 1);

        expect(view?.groups.find(row => row.key === knobs)?.open).toBe(true);
        expect(view?.groups.find(row => row.key === camera)?.open).toBe(false);
        expect(reduceSession(sprung, { kind: 'blur' }).sprung).toBeNull();
        expect(reduceSession(session, { kind: 'close' }).open).toEqual(session.open);
        expect(reduceSession(session, { kind: 'windows', ids: ['sketch-2'] }).open).toEqual([
            camera,
        ]);
    });

    it('springs a group open only for a wire it can take, and keeps it open where the wire landed', () => {
        const workspace = run([launch]);
        const view = wiringOf(workspace, signals, inputsFor, on, 1);
        const knobs = groupKey('sketch-2', 'Knobs');
        const signalOut = 'signal-5:output';
        const formulaOut = 'formula-1:output';

        expect(commandFor(view, { kind: 'hover', group: knobs, from: signalOut })).toEqual({
            kind: 'spring',
            key: knobs,
        });
        expect(commandFor(view, { kind: 'hover', group: knobs, from: formulaOut })).toBeNull();
        expect(commandFor(view, { kind: 'toggle', group: knobs })).toEqual({
            kind: 'expand',
            key: knobs,
            open: true,
        });
        expect(commandFor(view, { kind: 'land', to: 'sketch-2:input:k3' })).toEqual({
            kind: 'settle',
            group: knobs,
        });
        expect(commandFor(view, { kind: 'land', to: null })).toEqual({
            kind: 'settle',
            group: null,
        });

        const sprung = reduceSession(on, { kind: 'spring', key: knobs });

        expect(reduceSession(sprung, { kind: 'settle', group: knobs })).toMatchObject({
            open: [knobs],
            sprung: null,
        });
        expect(reduceSession(sprung, { kind: 'settle', group: null })).toMatchObject({
            open: [],
            sprung: null,
        });
    });

    it('leaves a program with no groups as plain rows', () => {
        const view = wiringOf(run([launch]), signals, inputsFor, on, 1);

        expect(view?.groups.filter(row => row.window === 'signal-5')).toEqual([]);
        expect(windowOfGroup(groupKey('signal-5', 'Knobs'))).toBe('signal-5');
    });
});

describe('sources of another type', () => {
    const voice: WorkspaceAction = { ...launch, program: 'voice' };
    const view = wiringOf(run([voice]), new Map(), inputsFor, on, 1);
    const socketOf = (input: string) =>
        view?.sockets.find(socket => socket.key === `voice-5:input:${input}`);

    it('are offered through the converter that fits, named by the reading it makes', () => {
        const sketch = socketOf('pitch')?.options.find(option => option.id === 'sketch-2');

        expect(sketch).toMatchObject({ via: 'picture-level', hint: 'brightness' });
        const end = socketOf('pitch')?.end;

        expect(end?.kind === 'port' && end.accepts.includes('sketch')).toBe(false);
    });

    it('turn a pick into one convert, carrying the span of the input they feed', () => {
        const pan = socketOf('pan');

        expect(pan === undefined ? null : selectionOf(pan, 'sketch-2')).toEqual({
            kind: 'convert',
            converter: 'picture-level',
            source: 'sketch-2',
            owner: 'store',
            sink: 'voice',
            input: 'pan',
            window: 'voice-5',
            low: -1,
            high: 1,
        });
    });

    it('draw a sparkline across the whole box, flat when nothing moves', () => {
        expect(sparkOf([0, 1])).toBe('M0.0 14.5 L48.0 1.5');
        expect(sparkOf([3, 3])).toBe('M0.0 8.0 L48.0 8.0');
    });
});

describe('a folded window', () => {
    const sketchLaunch: WorkspaceAction = {
        kind: 'launch',
        program: 'sketch',
        size: { width: 320, height: 420 },
        viewport,
    };
    const signals = new Map([['signal', defaultSignal]]);
    const foldedSketch = () => {
        const opened = run([sketchLaunch, launch]);
        const sketch = opened.processes.find(({ program }) => program === 'sketch');
        if (sketch === undefined) throw new Error('No sketch');
        const workspace = reduceWorkspace(opened, { kind: 'fold', id: sketch.id }, inputsFor);
        return { workspace, sketch };
    };

    it('bundles every input on one jack on its left edge, which never opens', () => {
        const { workspace, sketch } = foldedSketch();
        const session = { ...on, open: [groupKey(sketch.id, 'Knobs')] };
        const view = wiringOf(workspace, signals, inputsFor, session, 1);
        const groups = view?.groups.filter(row => row.window === sketch.id) ?? [];
        const shown = view?.sockets.filter(s => s.window === sketch.id && !s.hidden) ?? [];

        expect(groups).toHaveLength(1);
        expect(groups[0]).toMatchObject({ folded: true, open: false, side: 'left' });
        expect(groups[0]?.total).toBe(
            view?.sockets.filter(s => s.window === sketch.id && s.side === 'left').length,
        );
        expect(shown.every(socket => socket.side === 'right')).toBe(true);
        expect(
            commandFor(view, { kind: 'toggle', group: groupKey(sketch.id, 'inputs') }),
        ).toBeNull();
    });

    it('takes a dropped wire into the one input that accepts it, or opens its menu', () => {
        const { workspace, sketch } = foldedSketch();
        const view = wiringOf(workspace, signals, inputsFor, on, 1);
        const signalWindow = workspace.processes.find(({ program }) => program === 'signal');
        const signal = view?.sockets.find(
            socket => socket.end.kind === 'store' && socket.window === signalWindow?.id,
        );
        if (signal === undefined) throw new Error('No signal output');
        const drop = commandFor(view, {
            kind: 'drop',
            group: groupKey(sketch.id, 'inputs'),
            from: signal.key,
        });

        expect(drop).toEqual({ kind: 'manage', window: sketch.id });
    });

    it('wires a drop straight in when only one input takes it', () => {
        const opened = run([
            { kind: 'launch', program: 'focus', size: { width: 260, height: 340 }, viewport },
            { kind: 'launch', program: 'agenda', size: { width: 320, height: 460 }, viewport },
        ]);
        const focus = opened.processes.find(({ program }) => program === 'focus');
        const agenda = opened.processes.find(({ program }) => program === 'agenda');
        if (focus === undefined || agenda === undefined) throw new Error('Missing windows');
        const workspace = reduceWorkspace(opened, { kind: 'fold', id: focus.id }, inputsFor);
        const view = wiringOf(workspace, new Map(), inputsFor, on, 1);
        const output = view?.sockets.find(
            socket => socket.end.kind === 'store' && socket.window === agenda.id,
        );
        if (output === undefined) throw new Error('No agenda output');

        expect(
            commandFor(view, {
                kind: 'drop',
                group: groupKey(focus.id, 'inputs'),
                from: output.key,
            }),
        ).toMatchObject({ kind: 'wire' });
    });
});
