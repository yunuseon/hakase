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

describe('patchOf', () => {
    it('lists the windows that follow something, with a port per input', () => {
        const { sinks } = patchOf(run([]), inputsFor, titles);

        expect(sinks.map(({ id }) => id).sort()).toEqual(['playhead-4', 'sketch-2']);
        const sketch = sinks.find(({ id }) => id === 'sketch-2');
        const dial = sinks.find(({ id }) => id === 'playhead-4');

        expect(sketch?.ports.map(({ input, optional, bound }) => [input, optional, bound])).toEqual(
            [
                ['playback', false, 'playback:timeline'],
                ['k1', true, null],
                ['k2', true, null],
                ['k3', true, null],
                ['k4', true, null],
            ],
        );
        expect(dial?.ports[0]?.accepts).toEqual(['playback', 'focus']);
    });

    it('offers every followable store, and a main one only once something uses it', () => {
        const before = patchOf(run([]), inputsFor, titles);
        const after = patchOf(
            run([
                {
                    kind: 'follow',
                    id: 'playhead-4',
                    input: 'progress',
                    source: 'focus',
                    store: 'focus',
                },
            ]),
            inputsFor,
            titles,
        );

        expect(before.sources.map(({ id }) => id)).toEqual(['playback:timeline']);
        expect(after.sources.map(({ id }) => id)).toEqual(['playback:timeline', 'focus:focus']);
        expect(after.sinks.find(({ id }) => id === 'playhead-4')?.ports[0]?.bound).toBe(
            'focus:focus',
        );
    });
});
