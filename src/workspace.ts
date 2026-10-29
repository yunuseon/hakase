import {
    centreOf,
    fitted,
    IDENTITY,
    MAX_ZOOM,
    MIN_ZOOM,
    panned,
    worldAt,
    ZOOM_STEP,
    zoomedAround,
    zoomedTo,
    type Camera,
    type Extent,
    type Point,
} from './components/canvas/camera.ts';
import {
    isEdge,
    type Edge,
    type Placement,
    type ZoomCommand,
} from './components/toolbar/toolbar.ts';
import {
    frameFrom,
    moved,
    resized,
    type Frame,
    type Size,
    type WindowGesture,
} from './components/window/frame.ts';
import { clamp } from './lib/math.ts';
import { isProgramId, type ProcessId, type ProgramId } from './program.ts';

export type Process = {
    readonly id: ProcessId;
    readonly program: ProgramId;
    // In world units: the camera decides where that lands on screen.
    readonly frame: Frame;
};

// Floating has no `retracted`: a toolbar in its own window has nothing to slide away.
export type ToolbarState =
    | { readonly kind: 'docked'; readonly edge: Edge; readonly retracted: boolean }
    | { readonly kind: 'floating'; readonly frame: Frame; readonly lastEdge: Edge };

export type Workspace = {
    // Back to front: a process's index in here is its z-order.
    readonly processes: readonly Process[];
    // Monotone, so a relaunch never reuses a dead process's id.
    readonly launched: number;
    readonly camera: Camera;
    readonly toolbar: ToolbarState;
};

export type WorkspaceAction =
    | {
          readonly kind: 'launch';
          readonly program: ProgramId;
          readonly size: Size;
          readonly viewport: Extent;
      }
    | { readonly kind: 'pan'; readonly dx: number; readonly dy: number }
    | { readonly kind: 'zoom'; readonly factor: number; readonly at: Point }
    | { readonly kind: 'zoom-step'; readonly command: ZoomCommand; readonly viewport: Extent }
    | { readonly kind: 'place-toolbar'; readonly placement: Placement }
    | { readonly kind: 'retract-toolbar' }
    | { readonly kind: 'toolbar-window'; readonly gesture: WindowGesture }
    | (WindowGesture & { readonly id: ProcessId });

const CASCADE = 26;
const FLOATING_AT = 96;

export const defaultWorkspace = ({ width, height }: Extent): Workspace => {
    const gutter = 16;
    const left = 88;
    const editorWidth = Math.min(360, Math.round(width * 0.26));
    const timelineHeight = 108;
    const dialSize = 200;
    const editorHeight = Math.max(320, height - timelineHeight - 3 * gutter);
    const sketchX = left + editorWidth + gutter;

    return {
        processes: [
            {
                id: 'formula-1',
                program: 'formula',
                frame: { x: left, y: gutter, width: editorWidth, height: editorHeight, z: 0 },
            },
            {
                id: 'sketch-2',
                program: 'sketch',
                frame: { x: sketchX, y: gutter, width: 640, height: 640, z: 0 },
            },
            {
                id: 'timeline-3',
                program: 'timeline',
                frame: {
                    x: left,
                    y: editorHeight + 2 * gutter,
                    width: editorWidth,
                    height: timelineHeight,
                    z: 0,
                },
            },
            {
                id: 'playhead-4',
                program: 'playhead',
                frame: {
                    x: sketchX + 640 + 3 * gutter,
                    y: gutter,
                    width: dialSize,
                    height: dialSize + 44,
                    z: 0,
                },
            },
        ],
        launched: 4,
        camera: IDENTITY,
        toolbar: { kind: 'docked', edge: 'left', retracted: false },
    };
};

const withFrame = (
    workspace: Workspace,
    id: ProcessId,
    next: (frame: Frame) => Frame,
): Workspace => ({
    ...workspace,
    processes: workspace.processes.map(process =>
        process.id === id ? { ...process, frame: next(process.frame) } : process,
    ),
});

const stepped = (workspace: Workspace, command: ZoomCommand, viewport: Extent): Camera => {
    const { camera } = workspace;
    const centre = centreOf(viewport);

    switch (command) {
        case 'in':
            return zoomedAround(camera, ZOOM_STEP, centre);
        case 'out':
            return zoomedAround(camera, 1 / ZOOM_STEP, centre);
        case 'reset':
            return zoomedTo(camera, 1, centre);
        case 'fit':
            return fitted(
                workspace.processes.map(({ frame }) => frame),
                viewport,
            );
    }
};

const placed = (toolbar: ToolbarState, placement: Placement): ToolbarState => {
    if (placement !== 'float') {
        return { kind: 'docked', edge: placement, retracted: false };
    }

    return toolbar.kind === 'floating'
        ? toolbar
        : {
              kind: 'floating',
              frame: { x: FLOATING_AT, y: FLOATING_AT, z: 1, width: 0, height: 0 },
              lastEdge: toolbar.edge,
          };
};

// Screen pixels, not world: the toolbar's window sits outside the zoomed layer.
const toolbarGesture = (toolbar: ToolbarState, gesture: WindowGesture): ToolbarState => {
    if (toolbar.kind === 'docked') {
        return toolbar;
    }

    if (gesture.kind === 'quit') {
        return { kind: 'docked', edge: toolbar.lastEdge, retracted: false };
    }

    return gesture.kind === 'move'
        ? { ...toolbar, frame: moved(toolbar.frame, gesture.dx, gesture.dy) }
        : toolbar;
};

export const reduceWorkspace = (workspace: Workspace, action: WorkspaceAction): Workspace => {
    switch (action.kind) {
        case 'launch': {
            const launched = workspace.launched + 1;
            const step = ((launched % 8) - 4) * CASCADE;
            const centre = worldAt(workspace.camera, centreOf(action.viewport));

            return {
                ...workspace,
                launched,
                processes: [
                    ...workspace.processes,
                    {
                        id: `${action.program}-${launched}`,
                        program: action.program,
                        frame: {
                            ...action.size,
                            x: Math.round(centre.x - action.size.width / 2 + step),
                            y: Math.round(centre.y - action.size.height / 2 + step),
                            z: 0,
                        },
                    },
                ],
            };
        }
        case 'pan':
            return { ...workspace, camera: panned(workspace.camera, action.dx, action.dy) };
        case 'zoom':
            return {
                ...workspace,
                camera: zoomedAround(workspace.camera, action.factor, action.at),
            };
        case 'zoom-step':
            return { ...workspace, camera: stepped(workspace, action.command, action.viewport) };
        case 'place-toolbar':
            return { ...workspace, toolbar: placed(workspace.toolbar, action.placement) };
        case 'retract-toolbar':
            return workspace.toolbar.kind === 'docked'
                ? {
                      ...workspace,
                      toolbar: { ...workspace.toolbar, retracted: !workspace.toolbar.retracted },
                  }
                : workspace;
        case 'toolbar-window':
            return { ...workspace, toolbar: toolbarGesture(workspace.toolbar, action.gesture) };
        case 'quit':
            return {
                ...workspace,
                processes: workspace.processes.filter(({ id }) => id !== action.id),
            };
        case 'raise': {
            const raised = workspace.processes.find(({ id }) => id === action.id);

            return raised === undefined
                ? workspace
                : {
                      ...workspace,
                      processes: [
                          ...workspace.processes.filter(({ id }) => id !== action.id),
                          raised,
                      ],
                  };
        }
        // Deltas arrive in screen pixels; the frame is in world units.
        case 'move': {
            const { zoom } = workspace.camera;

            return withFrame(workspace, action.id, frame =>
                moved(frame, action.dx / zoom, action.dy / zoom),
            );
        }
        case 'resize': {
            const { zoom } = workspace.camera;

            return withFrame(workspace, action.id, frame =>
                resized(frame, action.edge, action.dx / zoom, action.dy / zoom),
            );
        }
    }
};

const finite = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const processFrom = (value: unknown): Process | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    if (!('id' in value && 'program' in value && 'frame' in value)) {
        return null;
    }

    const frame = frameFrom(value.frame);

    if (typeof value.id !== 'string' || typeof value.program !== 'string' || frame === null) {
        return null;
    }

    return isProgramId(value.program) ? { id: value.id, program: value.program, frame } : null;
};

const cameraFrom = (value: unknown): Camera | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    if (!('x' in value && 'y' in value && 'zoom' in value)) {
        return null;
    }

    const x = finite(value.x);
    const y = finite(value.y);
    const zoom = finite(value.zoom);

    return x === null || y === null || zoom === null
        ? null
        : { x, y, zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) };
};

const toolbarFrom = (value: unknown): ToolbarState | null => {
    if (typeof value !== 'object' || value === null || !('kind' in value)) {
        return null;
    }

    if (value.kind === 'docked' && 'edge' in value && 'retracted' in value) {
        const { edge, retracted } = value;

        return typeof edge === 'string' && isEdge(edge) && typeof retracted === 'boolean'
            ? { kind: 'docked', edge, retracted }
            : null;
    }

    if (value.kind === 'floating' && 'frame' in value && 'lastEdge' in value) {
        const frame = frameFrom(value.frame);
        const { lastEdge } = value;

        return frame !== null && typeof lastEdge === 'string' && isEdge(lastEdge)
            ? { kind: 'floating', frame, lastEdge }
            : null;
    }

    return null;
};

export const parseWorkspace = (value: unknown): Workspace | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    if (!('processes' in value && 'launched' in value && 'camera' in value && 'toolbar' in value)) {
        return null;
    }

    const launched = finite(value.launched);
    const stored = value.processes;
    const camera = cameraFrom(value.camera);
    const toolbar = toolbarFrom(value.toolbar);

    if (launched === null || !Array.isArray(stored) || camera === null || toolbar === null) {
        return null;
    }

    const processes = stored.map(processFrom);

    if (processes.some(process => process === null)) {
        return null;
    }

    return {
        processes: processes.filter(process => process !== null),
        launched,
        camera,
        toolbar,
    };
};
