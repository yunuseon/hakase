import { describe, expect, it } from 'vitest';
import {
    defaultMode,
    reduceMode,
    wiringOf,
    defaultSession,
    reduceSession,
    modeOf,
} from './state-mode.ts';
import {
    commandFor,
    connectionOf,
    groupKey,
    selectionOf,
    sameWiring,
    windowOfGroup,
} from './components/state-wiring/wiring.ts';
import { inputsFor } from './inputs.fixture.ts';
import { defaultSignal } from './shared/signal.ts';
import { defaultWorkspace, reduceWorkspace, type WorkspaceAction } from './workspace.ts';

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

    it('releases a menu lock when its window closes', () => {
        const selecting = reduceSession(defaultSession, {
            kind: 'busy',
            key: 'menu:signal-5',
            busy: true,
        });
        expect(modeOf(selecting).active).toBe(true);
        expect(modeOf(reduceSession(selecting, { kind: 'windows', ids: [] })).active).toBe(false);
    });

    it('keeps collapsed and expanded sockets inside their owning windows', () => {
        const workspace = run([launch]);
        const view = wiringOf(workspace, new Map(), inputsFor, on);
        expect(view).not.toBeNull();
        view?.sockets.forEach(socket => {
            const frame = workspace.processes.find(process => process.id === socket.window)?.frame;
            if (frame === undefined) throw new Error('Missing window');
            expect(socket.x).toBeGreaterThanOrEqual(frame.x);
            expect(socket.x + socket.width).toBeLessThanOrEqual(frame.x + frame.width);
            expect(socket.y).toBeGreaterThanOrEqual(frame.y + 36);
            expect(socket.y + 28).toBeLessThanOrEqual(frame.y + frame.height);
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
        expect(wiringOf(run(), new Map(), inputsFor, defaultSession)).toBeNull();
        const before = wiringOf(run(), new Map(), inputsFor, on);
        const after = wiringOf(run([{ kind: 'raise', id: 'formula-1' }]), new Map(), inputsFor, on);
        expect(after?.sockets.length).toBe(before?.sockets.length);
    });

    it('draws one clock wire to each follower and no duplicate shared-state wire', () => {
        const view = wiringOf(run(), new Map(), inputsFor, on);
        expect(view?.wires).toHaveLength(2);
        const shared = wiringOf(run([launch, launch]), new Map(), inputsFor, on);
        expect(shared?.wires.filter(wire => wire.shared)).toHaveLength(1);
    });

    it('keeps selectors intact while signal values change, and updates them when wiring changes', () => {
        const workspace = run([launch]);
        const before = wiringOf(workspace, new Map(), inputsFor, on);
        const edited = wiringOf(
            workspace,
            new Map([['signal', { ...defaultSignal, depth: 2 }]]),
            inputsFor,
            on,
        );
        expect(sameWiring(before, edited)).toBe(true);
        const renamed = reduceWorkspace(
            workspace,
            { kind: 'rename-store', id: 'signal-5', store: 'signal', name: 'Wave' },
            inputsFor,
        );
        expect(sameWiring(before, wiringOf(renamed, new Map(), inputsFor, on))).toBe(false);
    });

    it('keeps signal connections on the document and excludes sources that would loop', () => {
        const workspace = run([launch, launch, { kind: 'add-store', id: 'signal-6', copy: false }]);
        const signals = new Map([
            [
                'signal',
                { ...defaultSignal, sources: { phase: null, offset: null, depth: 'store-1' } },
            ],
        ]);
        const view = wiringOf(workspace, signals, inputsFor, on);
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
        const view = wiringOf(run(), new Map(), inputsFor, on);
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
        const focus = view?.sockets.find(socket => socket.key === 'playhead-4:input:progress');
        if (focus === undefined) throw new Error('Missing progress socket');
        expect(selectionOf(focus, 'focus')).toEqual({
            kind: 'connect',
            window: 'playhead-4',
            input: 'progress',
            source: 'focus',
            store: 'focus',
        });
    });

    it('allows output sharing only between windows of the same program', () => {
        const view = wiringOf(
            run([launch, launch, { kind: 'add-store', id: 'signal-6', copy: false }]),
            new Map(),
            inputsFor,
            on,
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

    it('keeps every row of the smallest sketch inside its frame, whichever group is open', () => {
        const workspace = run([small]);
        const sketch = sketchIn(workspace);
        const groups = ['Knobs', 'Camera', 'Look'];

        [null, ...groups].forEach(group => {
            const session = {
                ...on,
                open: group === null ? [] : [groupKey(sketch.id, group)],
            };
            const view = wiringOf(workspace, signals, inputsFor, session);
            const rows = [
                ...(view?.sockets ?? []).filter(
                    socket => socket.window === sketch.id && !socket.hidden,
                ),
                ...(view?.groups ?? []).filter(row => row.window === sketch.id),
            ];

            expect(rows.length).toBeGreaterThan(0);
            rows.forEach(row => {
                expect(row.x).toBeGreaterThanOrEqual(sketch.frame.x);
                expect(row.x + row.width).toBeLessThanOrEqual(sketch.frame.x + sketch.frame.width);
                expect(row.y + 28).toBeLessThanOrEqual(sketch.frame.y + sketch.frame.height);
            });
        });
    });

    it('lands a closed group’s wires on its own jack, and counts what is bound', () => {
        const workspace = run([
            small,
            {
                kind: 'follow',
                id: 'sketch-5',
                input: 'k2',
                source: 'signal',
                store: 'signal',
            },
        ]);
        const sketch = sketchIn(workspace);
        const view = wiringOf(workspace, signals, inputsFor, on);
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
        const view = wiringOf(run(), signals, inputsFor, sprung);

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
        const view = wiringOf(workspace, signals, inputsFor, on);
        const knobs = groupKey('sketch-2', 'Knobs');
        const signalOut = 'signal-5:output';
        const clockOut = 'timeline-3:output';

        expect(commandFor(view, { kind: 'hover', group: knobs, from: signalOut })).toEqual({
            kind: 'spring',
            key: knobs,
        });
        expect(commandFor(view, { kind: 'hover', group: knobs, from: clockOut })).toBeNull();
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
        const view = wiringOf(run([launch]), signals, inputsFor, on);

        expect(view?.groups.filter(row => row.window === 'signal-5')).toEqual([]);
        expect(windowOfGroup(groupKey('signal-5', 'Knobs'))).toBe('signal-5');
    });
});
