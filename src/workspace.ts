import {
    centredOn,
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
    type Rect,
} from './shared/camera.ts';
import type { ZoomCommand } from './components/navigator/navigator.ts';
import type { SeamView } from './components/seams/seams.ts';
import type { SectionGesture } from './components/sections/sections.ts';
import { isEdge, type Edge, type Placement } from './components/toolbar/toolbar.ts';
import {
    frameFrom,
    moved,
    resized,
    type Frame,
    type ResizeEdge,
    type Size,
    type WindowGesture,
} from './components/window/frame.ts';
import { clamp } from './lib/math.ts';
import { isProgramId, type ProcessId, type ProgramId } from './program.ts';

export type Section = {
    readonly id: string;
    readonly name: string;
    readonly rect: Rect;
};

export type Process = {
    readonly id: ProcessId;
    readonly program: ProgramId;
    readonly frame: Frame;
    // The window's laid-out size, which can exceed its frame when content will not shrink below its minimum.
    readonly measured: Size;
};

export type Link = {
    readonly a: ProcessId;
    readonly b: ProcessId;
};

type Drift = {
    readonly id: ProcessId;
    readonly x: number;
    readonly y: number;
};

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
    readonly minimap: boolean;
    readonly sections: readonly Section[];
    readonly links: readonly Link[];
    readonly drift: Drift | null;
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
    | { readonly kind: 'toggle-minimap' }
    | { readonly kind: 'undo' }
    | { readonly kind: 'redo' }
    | { readonly kind: 'set-camera'; readonly camera: Camera }
    | { readonly kind: 'add-section'; readonly viewport: Extent }
    | {
          readonly kind: 'move-section';
          readonly id: string;
          readonly dx: number;
          readonly dy: number;
      }
    | {
          readonly kind: 'resize-section';
          readonly id: string;
          readonly dx: number;
          readonly dy: number;
      }
    | { readonly kind: 'rename-section'; readonly id: string; readonly name: string }
    | { readonly kind: 'remove-section'; readonly id: string }
    | { readonly kind: 'close-others'; readonly keep: ProcessId }
    | { readonly kind: 'toggle-link'; readonly a: ProcessId; readonly b: ProcessId }
    | { readonly kind: 'reveal'; readonly id: ProcessId; readonly viewport: Extent }
    | { readonly kind: 'toolbar-window'; readonly gesture: WindowGesture }
    | (Exclude<WindowGesture, { readonly kind: 'resize' }> & { readonly id: ProcessId })
    // Carries the smallest size its program can lay out in; the workspace never learns programs.
    | (Extract<WindowGesture, { readonly kind: 'resize' }> & {
          readonly id: ProcessId;
          readonly minimum: Size;
      });

const CASCADE = 26;
const FLOATING_AT = 96;

export const defaultWorkspace = ({ width, height }: Extent): Workspace => {
    const gutter = 16;
    const left = 88;
    const editorWidth = Math.min(360, Math.round(width * 0.26));
    const timelineHeight = 136;
    const dialSize = 200;
    const editorHeight = Math.max(320, height - timelineHeight - 3 * gutter);
    const sketchX = left + editorWidth + gutter;

    const sized = (process: Omit<Process, 'measured'>): Process => ({
        ...process,
        measured: { width: process.frame.width, height: process.frame.height },
    });

    return {
        processes: (
            [
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
            ] satisfies Omit<Process, 'measured'>[]
        ).map(sized),
        launched: 4,
        camera: IDENTITY,
        toolbar: { kind: 'docked', edge: 'left', retracted: false },
        minimap: false,
        sections: [],
        links: [],
        drift: null,
    };
};

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
            return fitted(workspace.processes.map(boxOf), viewport);
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

const SNAP_REACH = 10;
const TOUCHING = 0.5;
const MIN_SEAM = 24;

export const boxOf = ({ frame, measured }: Process): Rect => ({
    x: frame.x,
    y: frame.y,
    width: measured.width,
    height: measured.height,
});

const overlap = (start: number, end: number, otherStart: number, otherEnd: number): number =>
    Math.min(end, otherEnd) - Math.max(start, otherStart);

export type Seam = Point & {
    readonly vertical: boolean;
};

export const seamBetween = (a: Rect, b: Rect): Seam | null => {
    const rows = overlap(a.y, a.y + a.height, b.y, b.y + b.height);
    const columns = overlap(a.x, a.x + a.width, b.x, b.x + b.width);
    const middleY = Math.max(a.y, b.y) + rows / 2;
    const middleX = Math.max(a.x, b.x) + columns / 2;

    if (rows >= MIN_SEAM && Math.abs(a.x + a.width - b.x) <= TOUCHING) {
        return { x: b.x, y: middleY, vertical: true };
    }

    if (rows >= MIN_SEAM && Math.abs(b.x + b.width - a.x) <= TOUCHING) {
        return { x: a.x, y: middleY, vertical: true };
    }

    if (columns >= MIN_SEAM && Math.abs(a.y + a.height - b.y) <= TOUCHING) {
        return { x: middleX, y: b.y, vertical: false };
    }

    if (columns >= MIN_SEAM && Math.abs(b.y + b.height - a.y) <= TOUCHING) {
        return { x: middleX, y: a.y, vertical: false };
    }

    return null;
};

const nearest = (offsets: readonly number[], reach: number): number =>
    offsets.reduce(
        (best, offset) =>
            Math.abs(offset) <= reach && Math.abs(offset) < Math.abs(best) ? offset : best,
        Infinity,
    );

const snapOffset = (moving: readonly Rect[], fixed: readonly Rect[], reach: number): Point => {
    const pairs = moving.flatMap(m => fixed.map(f => [m, f] as const));

    const dx = nearest(
        pairs
            .filter(([m, f]) => overlap(m.y, m.y + m.height, f.y, f.y + f.height) >= -reach)
            .flatMap(([m, f]) => [
                f.x - (m.x + m.width),
                f.x + f.width - m.x,
                f.x - m.x,
                f.x + f.width - (m.x + m.width),
            ]),
        reach,
    );
    const dy = nearest(
        pairs
            .filter(([m, f]) => overlap(m.x, m.x + m.width, f.x, f.x + f.width) >= -reach)
            .flatMap(([m, f]) => [
                f.y - (m.y + m.height),
                f.y + f.height - m.y,
                f.y - m.y,
                f.y + f.height - (m.y + m.height),
            ]),
        reach,
    );

    return { x: Number.isFinite(dx) ? dx : 0, y: Number.isFinite(dy) ? dy : 0 };
};

export const groupOf = (links: readonly Link[], id: ProcessId): ReadonlySet<ProcessId> => {
    const grown = (group: ReadonlySet<ProcessId>): ReadonlySet<ProcessId> => {
        const next = new Set(group);

        for (const { a, b } of links) {
            if (group.has(a)) {
                next.add(b);
            }

            if (group.has(b)) {
                next.add(a);
            }
        }

        return next.size === group.size ? group : grown(next);
    };

    return grown(new Set([id]));
};

const sameLink = (link: Link, a: ProcessId, b: ProcessId): boolean =>
    (link.a === a && link.b === b) || (link.a === b && link.b === a);

const touching = (processes: readonly Process[], { a, b }: Link): boolean => {
    const first = processes.find(({ id }) => id === a);
    const second = processes.find(({ id }) => id === b);

    return (
        first !== undefined &&
        second !== undefined &&
        seamBetween(boxOf(first), boxOf(second)) !== null
    );
};

const toggledLink = (workspace: Workspace, a: ProcessId, b: ProcessId): readonly Link[] =>
    workspace.links.some(link => sameLink(link, a, b))
        ? workspace.links.filter(link => !sameLink(link, a, b))
        : [...workspace.links, { a, b }];

const raisedGroup = (workspace: Workspace, id: ProcessId): readonly Process[] => {
    const group = groupOf(workspace.links, id);
    const raised = workspace.processes.filter(process => group.has(process.id));

    return [
        ...workspace.processes.filter(process => !group.has(process.id)),
        ...raised.filter(process => process.id !== id),
        ...raised.filter(process => process.id === id),
    ];
};

const movedGroup = (workspace: Workspace, id: ProcessId, dx: number, dy: number): Workspace => {
    const group = groupOf(workspace.links, id);
    const drift = workspace.drift?.id === id ? workspace.drift : { x: 0, y: 0 };
    const x = dx + drift.x;
    const y = dy + drift.y;

    const moving = workspace.processes
        .filter(process => group.has(process.id))
        .map(process => {
            const box = boxOf(process);

            return { ...box, x: box.x + x, y: box.y + y };
        });
    const fixed = workspace.processes.filter(process => !group.has(process.id)).map(boxOf);
    const snap = snapOffset(moving, fixed, SNAP_REACH / workspace.camera.zoom);

    return {
        ...workspace,
        drift: { id, x: -snap.x, y: -snap.y },
        processes: workspace.processes.map(process =>
            group.has(process.id)
                ? { ...process, frame: moved(process.frame, x + snap.x, y + snap.y) }
                : process,
        ),
    };
};

const resizedToNeighbours = (
    workspace: Workspace,
    id: ProcessId,
    edge: ResizeEdge,
    minimum: Size,
    dx: number,
    dy: number,
): Workspace => {
    const process = workspace.processes.find(candidate => candidate.id === id);

    if (process === undefined) {
        return workspace;
    }

    const drift = workspace.drift?.id === id ? workspace.drift : { x: 0, y: 0 };
    const x = dx + drift.x;
    const y = dy + drift.y;
    const box = boxOf(process);
    const reach = SNAP_REACH / workspace.camera.zoom;
    const neighbours = workspace.links
        .flatMap(({ a, b }) => (a === id ? [b] : b === id ? [a] : []))
        .flatMap(other => workspace.processes.filter(candidate => candidate.id === other))
        .map(boxOf);

    const edgeX = edge.includes('e')
        ? box.x + box.width + x
        : edge.includes('w')
          ? box.x + x
          : null;
    const edgeY = edge.includes('s')
        ? box.y + box.height + y
        : edge.includes('n')
          ? box.y + y
          : null;
    const snapX =
        edgeX === null
            ? Infinity
            : nearest(
                  neighbours.flatMap(n => [n.x - edgeX, n.x + n.width - edgeX]),
                  reach,
              );
    const snapY =
        edgeY === null
            ? Infinity
            : nearest(
                  neighbours.flatMap(n => [n.y - edgeY, n.y + n.height - edgeY]),
                  reach,
              );
    const snap = { x: Number.isFinite(snapX) ? snapX : 0, y: Number.isFinite(snapY) ? snapY : 0 };

    const frame = resized(process.frame, edge, x + snap.x, y + snap.y, minimum);
    // Grown with the frame, not left to the next measure: a stale size would misplace the next snap.
    const measured = {
        width: process.measured.width + frame.width - process.frame.width,
        height: process.measured.height + frame.height - process.frame.height,
    };

    return {
        ...workspace,
        drift: { id, x: -snap.x, y: -snap.y },
        processes: workspace.processes.map(candidate =>
            candidate.id === id ? { ...candidate, frame, measured } : candidate,
        ),
    };
};

const SECTION_INSET = 0.12;
const MIN_SECTION = 160;

export const visibleWorld = (camera: Camera, viewport: Extent): Rect => ({
    ...worldAt(camera, { x: 0, y: 0 }),
    width: viewport.width / camera.zoom,
    height: viewport.height / camera.zoom,
});

const contains = (rect: Rect, x: number, y: number): boolean =>
    x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

export const holds = (section: Section, process: Process): boolean => {
    const box = boxOf(process);

    return contains(section.rect, box.x + box.width / 2, box.y + box.height / 2);
};

const withSection = (
    workspace: Workspace,
    id: string,
    next: (section: Section) => Section,
): Workspace => ({
    ...workspace,
    sections: workspace.sections.map(section => (section.id === id ? next(section) : section)),
});

// Measured before moving: a member is whatever sat inside when the drag step began.
const movedSection = (workspace: Workspace, id: string, dx: number, dy: number): Workspace => {
    const section = workspace.sections.find(candidate => candidate.id === id);

    if (section === undefined) {
        return workspace;
    }

    return {
        ...withSection(workspace, id, current => ({
            ...current,
            rect: { ...current.rect, x: current.rect.x + dx, y: current.rect.y + dy },
        })),
        processes: workspace.processes.map(process =>
            holds(section, process) ? { ...process, frame: moved(process.frame, dx, dy) } : process,
        ),
    };
};

const step = (workspace: Workspace, action: WorkspaceAction): Workspace => {
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
                        measured: action.size,
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
        case 'set-camera':
            return { ...workspace, camera: action.camera };
        case 'add-section': {
            const launched = workspace.launched + 1;
            const view = visibleWorld(workspace.camera, action.viewport);
            const inset = Math.min(view.width, view.height) * SECTION_INSET;

            return {
                ...workspace,
                launched,
                sections: [
                    ...workspace.sections,
                    {
                        id: `section-${launched}`,
                        name: `Section ${workspace.sections.length + 1}`,
                        rect: {
                            x: Math.round(view.x + inset),
                            y: Math.round(view.y + inset),
                            width: Math.round(view.width - 2 * inset),
                            height: Math.round(view.height - 2 * inset),
                        },
                    },
                ],
            };
        }
        case 'move-section':
            return movedSection(
                workspace,
                action.id,
                action.dx / workspace.camera.zoom,
                action.dy / workspace.camera.zoom,
            );
        case 'resize-section':
            return withSection(workspace, action.id, section => ({
                ...section,
                rect: {
                    ...section.rect,
                    width: Math.max(
                        MIN_SECTION,
                        section.rect.width + action.dx / workspace.camera.zoom,
                    ),
                    height: Math.max(
                        MIN_SECTION,
                        section.rect.height + action.dy / workspace.camera.zoom,
                    ),
                },
            }));
        case 'rename-section': {
            const name = action.name.trim();

            return name === ''
                ? workspace
                : withSection(workspace, action.id, section => ({ ...section, name }));
        }
        case 'remove-section':
            return {
                ...workspace,
                sections: workspace.sections.filter(({ id }) => id !== action.id),
            };
        case 'toggle-minimap':
            return { ...workspace, minimap: !workspace.minimap };
        // History is History's business: on a bare workspace they do nothing.
        case 'undo':
        case 'redo':
            return workspace;
        case 'toolbar-window':
            return { ...workspace, toolbar: toolbarGesture(workspace.toolbar, action.gesture) };
        case 'close-others':
            return {
                ...workspace,
                processes: workspace.processes.filter(({ id }) => id === action.keep),
            };
        case 'toggle-link':
            return { ...workspace, links: toggledLink(workspace, action.a, action.b) };
        case 'measure':
            return {
                ...workspace,
                processes: workspace.processes.map(process =>
                    process.id === action.id
                        ? { ...process, measured: { width: action.width, height: action.height } }
                        : process,
                ),
            };
        case 'quit':
            return {
                ...workspace,
                processes: workspace.processes.filter(({ id }) => id !== action.id),
            };
        case 'reveal': {
            const raised = reduceWorkspace(workspace, { kind: 'raise', id: action.id });
            const shown = raised.processes.at(-1);

            return shown === undefined || shown.id !== action.id
                ? workspace
                : {
                      ...raised,
                      camera: centredOn(workspace.camera, boxOf(shown), action.viewport),
                  };
        }
        // A drag starts with a raise, so the last drag's drift never carries into this one.
        case 'raise':
            return workspace.processes.some(({ id }) => id === action.id)
                ? { ...workspace, drift: null, processes: raisedGroup(workspace, action.id) }
                : workspace;
        // Deltas arrive in screen pixels; the frame is in world units.
        case 'move': {
            const { zoom } = workspace.camera;

            return movedGroup(workspace, action.id, action.dx / zoom, action.dy / zoom);
        }
        case 'resize': {
            const { zoom } = workspace.camera;

            return resizedToNeighbours(
                workspace,
                action.id,
                action.edge,
                action.minimum,
                action.dx / zoom,
                action.dy / zoom,
            );
        }
    }
};

export const sectionAction = (gesture: SectionGesture): WorkspaceAction => {
    switch (gesture.kind) {
        case 'move':
            return { kind: 'move-section', id: gesture.id, dx: gesture.dx, dy: gesture.dy };
        case 'resize':
            return { kind: 'resize-section', id: gesture.id, dx: gesture.dx, dy: gesture.dy };
        case 'rename':
            return { kind: 'rename-section', id: gesture.id, name: gesture.name };
        case 'remove':
            return { kind: 'remove-section', id: gesture.id };
    }
};

export const reduceWorkspace = (workspace: Workspace, action: WorkspaceAction): Workspace => {
    const next = step(workspace, action);

    return { ...next, links: next.links.filter(link => touching(next.processes, link)) };
};

const finite = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const sizeFrom = (value: unknown): Size | null => {
    if (typeof value !== 'object' || value === null || !('width' in value && 'height' in value)) {
        return null;
    }

    const width = finite(value.width);
    const height = finite(value.height);

    return width === null || height === null ? null : { width, height };
};

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

    // Optional: saved before windows were measured, the frame's own size is the best guess.
    const measured = ('measured' in value ? sizeFrom(value.measured) : null) ?? frame;

    return isProgramId(value.program)
        ? {
              id: value.id,
              program: value.program,
              frame,
              measured: { width: measured.width, height: measured.height },
          }
        : null;
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

const linkFrom = (value: unknown): Link[] =>
    typeof value === 'object' &&
    value !== null &&
    'a' in value &&
    'b' in value &&
    typeof value.a === 'string' &&
    typeof value.b === 'string'
        ? [{ a: value.a, b: value.b }]
        : [];

const sectionFrom = (value: unknown): Section[] => {
    if (
        typeof value !== 'object' ||
        value === null ||
        !('id' in value && 'name' in value && 'rect' in value)
    ) {
        return [];
    }

    const { id, name, rect } = value;
    const frame = frameFrom(typeof rect === 'object' && rect !== null ? { z: 0, ...rect } : null);

    return typeof id === 'string' && typeof name === 'string' && frame !== null
        ? [{ id, name, rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height } }]
        : [];
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
    // Optional: a workspace saved before the minimap existed still restores, closed.
    const minimap = 'minimap' in value && value.minimap === true;
    const sections =
        'sections' in value && Array.isArray(value.sections)
            ? value.sections.flatMap(sectionFrom)
            : [];

    if (launched === null || !Array.isArray(stored) || camera === null || toolbar === null) {
        return null;
    }

    const processes = stored.map(processFrom);

    if (processes.some(process => process === null)) {
        return null;
    }

    const kept = processes.filter(process => process !== null);
    const links =
        'links' in value && Array.isArray(value.links) ? value.links.flatMap(linkFrom) : [];

    return {
        processes: kept,
        launched,
        camera,
        toolbar,
        minimap,
        sections,
        links: links.filter(link => touching(kept, link)),
        drift: null,
    };
};

export type Listed = {
    readonly process: Process;
    readonly ordinal: number;
    readonly focused: boolean;
};

// numeric: ids are `${program}-${launched}`, and "sketch-10" must sort after "sketch-9".
const byLaunch = (a: Process, b: Process): number =>
    a.id.localeCompare(b.id, undefined, { numeric: true });

export const listed = (processes: readonly Process[]): readonly Listed[] => {
    const front = processes.at(-1)?.id;

    return [...processes].sort(byLaunch).map((process, index, sorted) => ({
        process,
        ordinal:
            sorted.slice(0, index).filter(({ program }) => program === process.program).length + 1,
        focused: process.id === front,
    }));
};

export const seamsOf = ({ processes, links }: Workspace): readonly SeamView[] =>
    processes.flatMap((first, index) =>
        processes.slice(index + 1).flatMap(second => {
            const seam = seamBetween(boxOf(first), boxOf(second));

            return seam === null
                ? []
                : [
                      {
                          a: first.id,
                          b: second.id,
                          x: seam.x,
                          y: seam.y,
                          vertical: seam.vertical,
                          linked: links.some(link => sameLink(link, first.id, second.id)),
                      },
                  ];
        }),
    );

export type History = {
    readonly past: readonly Workspace[];
    readonly present: Workspace;
    readonly future: readonly Workspace[];
    // The step the last undoable action belonged to, so one drag is one step, not hundreds.
    readonly step: string | null;
};

const HISTORY_LIMIT = 100;

type Step = {
    readonly key: string;
    // A drag's many moves join one step; a launch or a delete is always a step of its own.
    readonly joins: boolean;
};

// Only what changes the layout of the work: camera, chrome and measurements are not steps.
const stepOf = (action: WorkspaceAction): Step | null => {
    switch (action.kind) {
        case 'move':
        case 'resize':
        case 'move-section':
        case 'resize-section':
            return { key: `${action.kind}:${action.id}`, joins: true };
        case 'launch':
        case 'quit':
        case 'close-others':
        case 'toggle-link':
        case 'add-section':
        case 'rename-section':
        case 'remove-section':
            return { key: action.kind, joins: false };
        default:
            return null;
    }
};

// Undoing restores where things were, not where you are looking: the camera and chrome stay put.
const keepingView = (restored: Workspace, current: Workspace): Workspace => ({
    ...restored,
    camera: current.camera,
    toolbar: current.toolbar,
    minimap: current.minimap,
    drift: null,
});

export const startHistory = (present: Workspace): History => ({
    past: [],
    present,
    future: [],
    step: null,
});

export const reduceHistory = (history: History, action: WorkspaceAction): History => {
    const { past, present, future } = history;

    if (action.kind === 'undo') {
        const previous = past.at(-1);

        return previous === undefined
            ? history
            : {
                  past: past.slice(0, -1),
                  present: keepingView(previous, present),
                  future: [present, ...future],
                  step: null,
              };
    }

    if (action.kind === 'redo') {
        const [next, ...rest] = future;

        return next === undefined
            ? history
            : {
                  past: [...past, present],
                  present: keepingView(next, present),
                  future: rest,
                  step: null,
              };
    }

    const reduced = reduceWorkspace(present, action);
    const step = stepOf(action);

    if (step === null) {
        // A raise starts every drag, so the next move opens a new step rather than joining the last.
        return {
            ...history,
            present: reduced,
            step: action.kind === 'raise' ? null : history.step,
        };
    }

    return step.joins && step.key === history.step
        ? { ...history, present: reduced }
        : {
              past: [...past, present].slice(-HISTORY_LIMIT),
              present: reduced,
              future: [],
              step: step.key,
          };
};
