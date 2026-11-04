import { describe, expect, it } from 'vitest';
import { inputsFor } from './inputs.fixture.ts';
import { linksOf } from './links.ts';
import { defaultSignal, type Signal } from './shared/signal.ts';
import { defaultWorkspace, reduceWorkspace, type WorkspaceAction } from './workspace.ts';

const viewport = { width: 1400, height: 900 };
const run = (actions: readonly WorkspaceAction[]) =>
    actions.reduce(
        (workspace, action) => reduceWorkspace(workspace, action, inputsFor),
        defaultWorkspace(viewport, inputsFor),
    );
const kinds = (
    workspace: ReturnType<typeof run>,
    signals: ReadonlyMap<string, Signal>,
    id: string,
) =>
    linksOf(workspace, signals, id).map(({ kind, from, to }) => [
        kind,
        workspace.processes.find(({ frame }) => frame.x === from.x && frame.y === from.y)?.id,
        workspace.processes.find(({ frame }) => frame.x === to.x && frame.y === to.y)?.id,
    ]);

describe('linksOf', () => {
    it('draws nothing while no menu is open', () => {
        expect(linksOf(run([]), new Map(), null)).toEqual([]);
    });

    it('runs from the window keeping a clock into the windows that follow it', () => {
        expect(kinds(run([]), new Map(), 'sketch-2')).toEqual([
            ['input', 'timeline-3', 'sketch-2'],
        ]);
        expect(kinds(run([]), new Map(), 'timeline-3')).toEqual([
            ['output', 'timeline-3', 'sketch-2'],
            ['output', 'timeline-3', 'playhead-4'],
        ]);
    });

    it('runs along a signal chain, window to window', () => {
        const workspace = run([
            { kind: 'launch', program: 'signal', size: { width: 300, height: 300 }, viewport },
            { kind: 'launch', program: 'signal', size: { width: 300, height: 300 }, viewport },
            { kind: 'add-store', id: 'signal-6', copy: false },
        ]);
        const signals = new Map<string, Signal>([
            [
                'signal',
                { ...defaultSignal, sources: { phase: null, offset: null, depth: 'store-1' } },
            ],
        ]);

        expect(kinds(workspace, signals, 'signal-5')).toContainEqual([
            'input',
            'signal-6',
            'signal-5',
        ]);
        expect(kinds(workspace, signals, 'signal-6')).toContainEqual([
            'output',
            'signal-6',
            'signal-5',
        ]);
    });

    it('ties windows that keep the same state', () => {
        const workspace = run([
            { kind: 'launch', program: 'todo', size: { width: 300, height: 300 }, viewport },
            { kind: 'launch', program: 'todo', size: { width: 300, height: 300 }, viewport },
        ]);

        expect(kinds(workspace, new Map(), 'todo-5')).toEqual([['shared', 'todo-5', 'todo-6']]);
    });
});
