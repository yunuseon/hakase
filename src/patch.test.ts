import { describe, expect, it } from 'vitest';
import { inputsFor } from './inputs.fixture.ts';
import { patchOf } from './patch.ts';
import { defaultWorkspace, reduceWorkspace, type WorkspaceAction } from './workspace.ts';

const viewport = { width: 1400, height: 900 };
const titles = (program: string) => ({ title: program, icon: '' });
const run = (actions: readonly WorkspaceAction[]) =>
    actions.reduce(
        (workspace, action) => reduceWorkspace(workspace, action, inputsFor),
        defaultWorkspace(viewport, inputsFor),
    );
const patch = (actions: readonly WorkspaceAction[] = []) =>
    patchOf(run(actions), inputsFor, titles);
const windowOf = (actions: readonly WorkspaceAction[], id: string) =>
    patch(actions).windows.find(window => window.id === id);

describe('patchOf', () => {
    it('lists every window that keeps or follows state, with a port per input', () => {
        const { windows } = patch();

        expect(windows.map(({ id }) => id).sort()).toEqual([
            'formula-1',
            'playhead-4',
            'sketch-2',
            'timeline-3',
        ]);
        expect(
            windows
                .find(({ id }) => id === 'sketch-2')
                ?.ports.map(({ input, optional, bound }) => [input, optional, bound]),
        ).toEqual([
            ['playback', false, 'timeline'],
            ['k1', true, null],
            ['k2', true, null],
            ['k3', true, null],
            ['k4', true, null],
        ]);
        expect(windowOf([], 'playhead-4')?.own).toBeNull();
    });

    it('lists every store, private or shared, and wires each window to its own', () => {
        expect(
            patch()
                .stores.map(({ id }) => id)
                .sort(),
        ).toEqual(['formula-1', 'sketch-2', 'timeline']);
        expect(windowOf([], 'sketch-2')?.own).toBe('sketch-2');
        expect(windowOf([], 'playhead-4')?.own).toBeNull();
    });

    it('always offers what can be followed, a clock first, and a main store once something follows it', () => {
        const following: WorkspaceAction[] = [
            {
                kind: 'follow',
                id: 'playhead-4',
                input: 'progress',
                source: 'focus',
                store: 'focus',
            },
        ];

        expect(
            patch(following)
                .stores.map(({ id, kind }) => [id, kind])
                .slice(0, 2),
        ).toEqual([
            ['timeline', 'playback'],
            ['focus', 'focus'],
        ]);
        expect(windowOf(following, 'playhead-4')?.ports[0]?.bound).toBe('focus');
    });
});
