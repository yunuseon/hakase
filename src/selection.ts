import type { ProcessId } from './program.ts';
import type { SelectionView } from './components/selection/selection.ts';
import { overlaps } from './shared/area.ts';
import type { Rect } from './shared/camera.ts';
import { boxOf, type Workspace } from './workspace.ts';

export const selectedIn = (workspace: Workspace, rect: Rect): readonly ProcessId[] =>
    workspace.processes.filter(process => overlaps(boxOf(process), rect)).map(p => p.id);

export const selectionView = (
    workspace: Workspace,
    ids: readonly ProcessId[],
    copied: boolean,
): SelectionView => ({
    copied,
    boxes: workspace.processes
        .filter(p => ids.includes(p.id))
        .map(process => {
            const rect = boxOf(process),
                camera = workspace.camera;
            return {
                x: rect.x * camera.zoom + camera.x,
                y: rect.y * camera.zoom + camera.y,
                width: rect.width * camera.zoom,
                height: rect.height * camera.zoom,
            };
        }),
});
