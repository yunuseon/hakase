import type { ProcessId } from './program.ts';
import type { SelectionView } from './components/selection/selection.ts';
import { overlaps } from './shared/area.ts';
import type { Rect } from './shared/camera.ts';
import { boxOf, type Workspace } from './workspace.ts';

export const selectedIn = (workspace: Workspace, rect: Rect): readonly ProcessId[] =>
    workspace.processes.filter(process => overlaps(boxOf(process), rect)).map(p => p.id);

export const selectionView = (
    live: readonly ProcessId[],
    ids: readonly ProcessId[],
    copied: boolean,
    boxable = false,
): SelectionView => ({
    copied,
    boxable,
    count: live.filter(id => ids.includes(id)).length,
});
