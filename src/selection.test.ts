import { describe, expect, it } from 'vitest';
import { selectedIn, selectionView } from './selection.ts';
import { defaultWorkspace } from './workspace.ts';
import { inputsFor } from './inputs.fixture.ts';
const initial = defaultWorkspace({ width: 1400, height: 900 }, inputsFor);
const workspace = {
    ...initial,
    camera: { x: 50, y: -20, zoom: 0.5 },
    processes: initial.processes.slice(0, 2).map((p, i) => ({
        ...p,
        frame: { x: i * 400, y: 0, z: 0, width: 300, height: 300 },
        measured: { width: 300, height: 300 },
    })),
};
describe('program selection', () => {
    it('selects intersecting programs independently of workspace areas', () => {
        const ids = workspace.processes.map(p => p.id);
        expect(
            selectedIn({ ...workspace, sections: [] }, { x: 250, y: 100, width: 200, height: 100 }),
        ).toEqual(ids);
        expect(selectedIn(workspace, { x: 301, y: 0, width: 98, height: 300 })).toEqual([]);
    });
    it('counts only selected programs that are still open', () => {
        const first = workspace.processes[0];
        if (first === undefined) throw new Error('Missing fixture');
        expect(
            selectionView(
                workspace.processes.map(p => p.id),
                [first.id, 'closed'],
                true,
            ),
        ).toEqual({
            copied: true,
            boxable: false,
            count: 1,
        });
        expect(selectionView([], [first.id], true)).toEqual({
            copied: true,
            boxable: false,
            count: 0,
        });
    });
});
