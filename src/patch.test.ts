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
const launchSketch: WorkspaceAction = {
    kind: 'launch',
    program: 'sketch',
    size: { width: 640, height: 820 },
    viewport,
};

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

    it('folds a store only one window uses into a tag, and makes it a node once shared', () => {
        expect(windowOf([], 'sketch-2')?.own?.shown).toBe('tag');
        expect(patch().stores.map(({ id }) => id)).toEqual(['timeline']);

        const shared: WorkspaceAction[] = [
            launchSketch,
            { kind: 'bind-store', id: 'sketch-5', store: 'sketch-2' },
        ];

        expect(windowOf(shared, 'sketch-2')?.own?.shown).toBe('node');
        expect(patch(shared).stores.map(({ id }) => id)).toContain('sketch-2');
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

        expect(windowOf([], 'timeline-3')?.own?.shown).toBe('node');
        expect(patch(following).stores.map(({ id, kind }) => [id, kind])).toEqual([
            ['timeline', 'playback'],
            ['focus', 'focus'],
        ]);
        expect(windowOf(following, 'playhead-4')?.ports[0]?.bound).toBe('focus');
    });
});
