import { describe, expect, it } from 'vitest';
import {
    defaultWorkspace,
    parseWorkspace,
    reduceHistory,
    startHistory,
    type History,
    type WorkspaceAction,
} from './workspace.ts';

const viewport = { width: 1400, height: 900 };

const run = (history: History, actions: readonly WorkspaceAction[]): History =>
    actions.reduce(reduceHistory, history);

const fresh = (): History => startHistory(defaultWorkspace(viewport));

const frameOf = (history: History, id: string) =>
    history.present.processes.find(process => process.id === id)?.frame;

const firstId = (history: History): string => history.present.processes[0]?.id ?? '';

const drag = (id: string, steps: number): WorkspaceAction[] => [
    { kind: 'raise', id },
    ...Array.from({ length: steps }, (): WorkspaceAction => ({ kind: 'move', id, dx: 10, dy: 0 })),
];

describe('reduceHistory', () => {
    it('makes one drag one undo step', () => {
        const start = fresh();
        const id = firstId(start);
        const before = frameOf(start, id);
        const dragged = run(start, drag(id, 20));

        expect(frameOf(dragged, id)?.x).not.toBe(before?.x);

        const undone = reduceHistory(dragged, { kind: 'undo' });

        expect(frameOf(undone, id)).toEqual(before);
    });

    it('makes two drags two steps, split by the raise that starts each', () => {
        const start = fresh();
        const id = firstId(start);
        const twice = run(start, [...drag(id, 5), ...drag(id, 5)]);
        const once = reduceHistory(twice, { kind: 'undo' });

        expect(once.past).toHaveLength(1);
        expect(frameOf(once, id)?.x).toBe((frameOf(start, id)?.x ?? 0) + 50);
    });

    it('keeps the current camera through an undo', () => {
        const start = fresh();
        const id = firstId(start);
        const moved = run(start, [...drag(id, 3), { kind: 'pan', dx: 200, dy: 0 }]);
        const undone = reduceHistory(moved, { kind: 'undo' });

        expect(undone.present.camera).toEqual(moved.present.camera);
    });

    it('does not record camera moves as steps', () => {
        const panned = run(fresh(), [{ kind: 'pan', dx: 40, dy: 0 }]);

        expect(panned.past).toHaveLength(0);
    });

    it('redoes what was undone, and a new step drops the redo', () => {
        const start = fresh();
        const id = firstId(start);
        const dragged = run(start, drag(id, 3));
        const undone = reduceHistory(dragged, { kind: 'undo' });

        expect(frameOf(reduceHistory(undone, { kind: 'redo' }), id)).toEqual(frameOf(dragged, id));

        const diverged = run(undone, drag(id, 1));

        expect(diverged.future).toHaveLength(0);
    });

    it('clamps a resize to the minimum the action carries', () => {
        const start = fresh();
        const id = firstId(start);
        const shrunk = run(start, [
            { kind: 'raise', id },
            {
                kind: 'resize',
                id,
                edge: 'se',
                dx: -5000,
                dy: -5000,
                minimum: { width: 300, height: 250 },
            },
        ]);

        expect(frameOf(shrunk, id)).toMatchObject({ width: 300, height: 250 });
    });
});

describe('parseWorkspace', () => {
    const saved = (program: string) => {
        const workspace = defaultWorkspace(viewport);
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
        const parsed = parseWorkspace(saved('retired'));

        expect(parsed?.processes).toHaveLength(defaultWorkspace(viewport).processes.length - 1);
    });

    it('brings a links window back as bookmarks', () => {
        expect(parseWorkspace(saved('links'))?.processes[0]?.program).toBe('bookmarks');
    });
});
