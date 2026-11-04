import {
    accepts,
    definitionOf,
    fits,
    initialFollows,
    followedStores,
    progressBinding,
    sourceProgram,
    type Bindings,
    type BindingsOf,
    type Follow,
    type InputsFor,
} from './inputs.ts';
import { reachedFrom, type Linked } from './shared/signal.ts';
import type { programs } from './programs.ts';
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
import { ensured, HOLDING, mainStore, pruned, type StoreEntry, type StoreId } from './stores.ts';

export type Section = {
    readonly id: string;
    readonly name: string;
    readonly rect: Rect;
};

type ProcessBase = {
    readonly id: ProcessId;
    readonly frame: Frame;
    readonly store: StoreId;
    readonly measured: Size;
};

type ProcessOf<K extends ProgramId> = ProcessBase & {
    readonly program: K;
    readonly follows: BindingsOf<(typeof programs)[K]['inputs']>;
};

export type Process = { readonly [K in ProgramId]: ProcessOf<K> }[ProgramId];

type Draft = ProcessBase & { readonly program: ProgramId; readonly follows: Bindings };

const ownsInputs =
    (inputsFor: InputsFor) =>
    (draft: Draft): draft is Process =>
        fits(inputsFor(draft.program), draft.follows);

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
    readonly stores: readonly StoreEntry[];
    // Monotone, like `launched`: a deleted store's id is never handed out again.
    readonly made: number;
    readonly drift: Drift | null;
};

export type WorkspaceAction =
    | {
          readonly kind: 'launch';
          readonly program: ProgramId;
          readonly size: Size;
          readonly viewport: Extent;
          readonly camera?: Camera;
          readonly order?: number;
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
    | { readonly kind: 'add-section'; readonly viewport: Extent; readonly camera?: Camera }
    | {
          readonly kind: 'move-section';
          readonly id: string;
          readonly dx: number;
          readonly dy: number;
          readonly camera?: Camera;
      }
    | {
          readonly kind: 'resize-section';
          readonly id: string;
          readonly dx: number;
          readonly dy: number;
          readonly camera?: Camera;
      }
    | { readonly kind: 'rename-section'; readonly id: string; readonly name: string }
    | { readonly kind: 'remove-section'; readonly id: string }
    | { readonly kind: 'close-others'; readonly keep: ProcessId }
    // What signals follow, so a store that only feeds another signal survives the prune.
    | { readonly kind: 'prune-stores'; readonly followed: ReadonlyMap<StoreId, Linked> }
    // Back (negative) or forward through the history by that many steps.
    | { readonly kind: 'travel'; readonly offset: number }
    | { readonly kind: 'toggle-link'; readonly a: ProcessId; readonly b: ProcessId }
    | { readonly kind: 'reveal'; readonly id: ProcessId; readonly viewport: Extent }
    | { readonly kind: 'toolbar-window'; readonly gesture: WindowGesture }
    | (Exclude<WindowGesture, { readonly kind: 'resize' }> & {
          readonly id: ProcessId;
          readonly camera?: Camera;
      })
    // Carries the smallest size its program can lay out in; the workspace never learns programs.
    | (Extract<WindowGesture, { readonly kind: 'resize' }> & {
          readonly id: ProcessId;
          readonly minimum: Size;
          readonly camera?: Camera;
      });

const CASCADE = 26;
const FLOATING_AT = 96;

export const defaultWorkspace = ({ width, height }: Extent, inputsFor: InputsFor): Workspace => {
    const gutter = 16;
    const left = 88;
    const editorWidth = Math.min(360, Math.round(width * 0.26));
    const timelineHeight = 136;
    const dialSize = 200;
    const editorHeight = Math.max(320, height - timelineHeight - 3 * gutter);
    const sketchX = left + editorWidth + gutter;

    const sized = (process: Omit<Draft, 'measured' | 'follows'>) => {
        const draft = {
            ...process,
            follows: initialFollows(inputsFor(process.program)),
            measured: { width: process.frame.width, height: process.frame.height },
        };

        return ownsInputs(inputsFor)(draft) ? [draft] : [];
    };

    return {
        processes: (
            [
                {
                    id: 'formula-1',
                    program: 'formula',
                    store: 'formula-1',
                    frame: { x: left, y: gutter, width: editorWidth, height: editorHeight, z: 0 },
                },
                {
                    id: 'sketch-2',
                    program: 'sketch',
                    store: 'sketch-2',
                    frame: { x: sketchX, y: gutter, width: 640, height: 640, z: 0 },
                },
                {
                    id: 'timeline-3',
                    program: 'timeline',
                    store: 'timeline',
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
                    store: 'playhead',
                    frame: {
                        x: sketchX + 640 + 3 * gutter,
                        y: gutter,
                        width: dialSize,
                        height: dialSize + 44,
                        z: 0,
                    },
                },
            ] satisfies Omit<Draft, 'measured' | 'follows'>[]
        ).flatMap(sized),
        launched: 4,
        camera: IDENTITY,
        toolbar: { kind: 'docked', edge: 'left', retracted: false },
        minimap: false,
        sections: [],
        links: [],
        stores: [
            { id: 'formula-1', program: 'formula', name: 'formula 1', kept: false, copy: null },
            { id: 'sketch-2', program: 'sketch', name: 'sketch 2', kept: false, copy: null },
            mainStore('timeline'),
            mainStore('playhead'),
        ],
        made: 0,
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

type Side = 'n' | 'e' | 's' | 'w';

// Which side of `box` the other window is attached to, judged as seams are.
const sideOf = (box: Rect, other: Rect): Side | null => {
    const rows = overlap(box.y, box.y + box.height, other.y, other.y + other.height);
    const columns = overlap(box.x, box.x + box.width, other.x, other.x + other.width);

    if (rows > 0 && Math.abs(box.x + box.width - other.x) <= TOUCHING) {
        return 'e';
    }

    if (rows > 0 && Math.abs(other.x + other.width - box.x) <= TOUCHING) {
        return 'w';
    }

    if (columns > 0 && Math.abs(box.y + box.height - other.y) <= TOUCHING) {
        return 's';
    }

    return columns > 0 && Math.abs(other.y + other.height - box.y) <= TOUCHING ? 'n' : null;
};

const shiftOf = (side: Side, before: Rect, after: Rect): Point => {
    switch (side) {
        case 'e':
            return { x: after.x + after.width - (before.x + before.width), y: 0 };
        case 'w':
            return { x: after.x - before.x, y: 0 };
        case 's':
            return { x: 0, y: after.y + after.height - (before.y + before.height) };
        case 'n':
            return { x: 0, y: after.y - before.y };
    }
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
    const partners = workspace.links
        .flatMap(({ a, b }) => (a === id ? [b] : b === id ? [a] : []))
        .flatMap(other => workspace.processes.filter(candidate => candidate.id === other));
    // Attached on a side being resized: carried with the edge rather than snapped to, or the edge could never push.
    const carried = partners.flatMap(partner => {
        const side = sideOf(box, boxOf(partner));

        return side !== null && edge.includes(side) ? [{ partner, side }] : [];
    });
    // Linked onward from a carried window, but not back through this one, everything moves with it.
    const others = workspace.links.filter(({ a, b }) => a !== id && b !== id);
    const moving = new Set(carried.flatMap(({ partner }) => [...groupOf(others, partner.id)]));
    // Every window near the edge, linked or not: snapping only to linked ones made it depend on what was attached.
    const neighbours = workspace.processes
        .filter(candidate => candidate.id !== id && !moving.has(candidate.id))
        .map(boxOf);
    // The box as dragged, not as it was: a corner reaching a neighbour must count it as beside it.
    const left = box.x + (edge.includes('w') ? x : 0);
    const right = box.x + box.width + (edge.includes('e') ? x : 0);
    const top = box.y + (edge.includes('n') ? y : 0);
    const bottom = box.y + box.height + (edge.includes('s') ? y : 0);
    const besideRows = neighbours.filter(n => overlap(top, bottom, n.y, n.y + n.height) >= -reach);
    const besideColumns = neighbours.filter(
        n => overlap(left, right, n.x, n.x + n.width) >= -reach,
    );

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
                  besideRows.flatMap(n => [n.x - edgeX, n.x + n.width - edgeX]),
                  reach,
              );
    const snapY =
        edgeY === null
            ? Infinity
            : nearest(
                  besideColumns.flatMap(n => [n.y - edgeY, n.y + n.height - edgeY]),
                  reach,
              );
    const snap = { x: Number.isFinite(snapX) ? snapX : 0, y: Number.isFinite(snapY) ? snapY : 0 };

    const frame = resized(process.frame, edge, x + snap.x, y + snap.y, minimum);
    // Grown with the frame, not left to the next measure: a stale size would misplace the next snap.
    const measured = {
        width: process.measured.width + frame.width - process.frame.width,
        height: process.measured.height + frame.height - process.frame.height,
    };

    const after: Rect = { x: frame.x, y: frame.y, width: measured.width, height: measured.height };
    const shifts = carried.reduce<ReadonlyMap<ProcessId, Point>>((all, { partner, side }) => {
        const shift = shiftOf(side, box, after);

        return [...groupOf(others, partner.id)].reduce((next, member) => {
            const before = next.get(member) ?? { x: 0, y: 0 };

            return member === id
                ? next
                : new Map(next).set(member, { x: before.x + shift.x, y: before.y + shift.y });
        }, all);
    }, new Map());

    return {
        ...workspace,
        drift: { id, x: -snap.x, y: -snap.y },
        processes: workspace.processes.map(candidate => {
            const shift = shifts.get(candidate.id);

            return candidate.id === id
                ? { ...candidate, frame, measured }
                : shift === undefined
                  ? candidate
                  : { ...candidate, frame: moved(candidate.frame, shift.x, shift.y) };
        }),
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

const step = (
    workspace: Workspace,
    action: WorkspaceAction,
    inputsFor: InputsFor,
    seq: number | undefined,
): Workspace => {
    // A logged action names what it makes by its own sequence number, so replaying the log without an earlier step names it the same.
    const tag = (counter: number) => seq ?? counter;

    switch (action.kind) {
        case 'launch': {
            const launched = workspace.launched + 1;
            const step = (((action.order ?? launched) % 8) - 4) * CASCADE;
            const centre = worldAt(workspace.camera, centreOf(action.viewport));
            const own = HOLDING[action.program]?.sharing === 'private';
            const store: StoreEntry = own
                ? {
                      id: `${action.program}-${tag(launched)}`,
                      program: action.program,
                      name: `${action.program} ${launched}`,
                      kept: false,
                      copy: null,
                  }
                : mainStore(action.program);
            const process = {
                id: `${action.program}-${tag(launched)}`,
                program: action.program,
                store: store.id,
                follows: initialFollows(inputsFor(action.program)),
                measured: action.size,
                frame: {
                    ...action.size,
                    x: Math.round(centre.x - action.size.width / 2 + step),
                    y: Math.round(centre.y - action.size.height / 2 + step),
                    z: 0,
                },
            };

            return ownsInputs(inputsFor)(process)
                ? {
                      ...workspace,
                      launched,
                      stores: ensured(workspace.stores, store),
                      processes: [...workspace.processes, process],
                  }
                : workspace;
        }
        case 'bind-store': {
            const process = workspace.processes.find(({ id }) => id === action.id);
            const store = workspace.stores.find(({ id }) => id === action.store);

            // Only to a store of its own program: a board cannot read bookmarks.
            return process === undefined || store?.program !== process.program
                ? workspace
                : rebound(workspace, action.id, store.id);
        }
        case 'add-store': {
            const process = workspace.processes.find(({ id }) => id === action.id);

            if (process === undefined) {
                return workspace;
            }

            const made = workspace.made + 1;
            const id = `store-${tag(made)}`;
            const store: StoreEntry = {
                id,
                program: process.program,
                name: `Store ${made}`,
                kept: true,
                copy: action.copy ? process.store : null,
            };

            return rebound(
                { ...workspace, made, stores: [...workspace.stores, store] },
                process.id,
                id,
            );
        }
        case 'rename-store': {
            const name = action.name.trim();

            return name === ''
                ? workspace
                : {
                      ...workspace,
                      stores: workspace.stores.map(store =>
                          store.id === action.store ? { ...store, name, kept: true } : store,
                      ),
                  };
        }
        case 'replace': {
            const index = workspace.processes.findIndex(({ id }) => id === action.id);
            const process = workspace.processes[index];
            const program = action.program;

            if (process === undefined || !isProgramId(program)) {
                return workspace;
            }

            const launched = workspace.launched + 1;
            const chosen = workspace.stores.find(
                store => store.id === action.store && store.program === program,
            );
            const fresh =
                chosen === undefined && HOLDING[program] !== null && action.store !== program;
            const made = fresh ? workspace.made + 1 : workspace.made;
            const store: StoreEntry =
                chosen ??
                (fresh
                    ? {
                          id: `store-${tag(made)}`,
                          program,
                          name: `Store ${made}`,
                          kept: true,
                          copy: null,
                      }
                    : mainStore(program));
            const id = `${program}-${tag(launched)}`;
            const frame = {
                ...process.frame,
                width: Math.max(process.frame.width, action.minimum.width),
                height: Math.max(process.frame.height, action.minimum.height),
            };
            const renamed = (other: ProcessId): ProcessId => (other === process.id ? id : other);
            const replacement = {
                id,
                program,
                store: store.id,
                follows: initialFollows(inputsFor(program)),
                frame,
                measured: { width: frame.width, height: frame.height },
            };

            if (!ownsInputs(inputsFor)(replacement)) {
                return workspace;
            }

            // Same place in the list, so the new window keeps the old one's depth.
            return {
                ...workspace,
                launched,
                made,
                stores: ensured(workspace.stores, store),
                processes: workspace.processes.map((other, at) =>
                    at === index ? replacement : other,
                ),
                links: workspace.links.map(({ a, b }) => ({ a: renamed(a), b: renamed(b) })),
            };
        }
        case 'follow': {
            const process = workspace.processes.find(({ id }) => id === action.id);
            const binding = progressBinding(action.source, action.store);
            const target = workspace.stores.find(store => store.id === action.store);

            if (
                process === undefined ||
                binding === null ||
                !accepts(inputsFor(process.program), action.input, binding.kind)
            ) {
                return workspace;
            }

            const program = sourceProgram(binding.kind);

            if (target === undefined ? action.store !== program : target.program !== program) {
                return workspace;
            }

            const following = {
                ...process,
                follows: { ...process.follows, [action.input]: binding },
            };

            return ownsInputs(inputsFor)(following)
                ? {
                      ...workspace,
                      stores: ensured(workspace.stores, target ?? mainStore(program)),
                      processes: workspace.processes.map(other =>
                          other.id === action.id ? following : other,
                      ),
                  }
                : workspace;
        }
        case 'unfollow': {
            const process = workspace.processes.find(({ id }) => id === action.id);

            if (process === undefined) {
                return workspace;
            }

            const unfollowed = {
                ...process,
                follows: Object.fromEntries(
                    Object.entries(process.follows).filter(([name]) => name !== action.input),
                ),
            };

            return ownsInputs(inputsFor)(unfollowed)
                ? {
                      ...workspace,
                      processes: workspace.processes.map(other =>
                          other.id === action.id ? unfollowed : other,
                      ),
                  }
                : workspace;
        }
        case 'prune-stores': {
            const bound = reachedFrom(action.followed, usedStores(workspace.processes));

            return { ...workspace, stores: workspace.stores.filter(({ id }) => bound.has(id)) };
        }
        case 'remove-store':
            // Only a store no window uses: removing one under a window would leave it reading nothing.
            return usedStores(workspace.processes).has(action.store)
                ? workspace
                : {
                      ...workspace,
                      stores: workspace.stores.filter(({ id }) => id !== action.store),
                  };
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
                        id: `section-${tag(launched)}`,
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
        case 'travel':
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
            const raised = reduceWorkspace(workspace, { kind: 'raise', id: action.id }, inputsFor);
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

// Bound or followed: a clock a sketch runs on is in use even with no timeline window open.
export const usedStores = (processes: readonly Process[]): ReadonlySet<StoreId> =>
    new Set(processes.flatMap(({ store, follows }) => [store, ...followedStores(follows)]));

const rebound = (workspace: Workspace, id: ProcessId, store: StoreId): Workspace => ({
    ...workspace,
    processes: workspace.processes.map(process =>
        process.id === id ? { ...process, store } : process,
    ),
});

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

export const reduceWorkspace = (
    workspace: Workspace,
    action: WorkspaceAction,
    inputsFor: InputsFor,
    seq?: number,
): Workspace => {
    // Not set-camera: its camera is where the view goes, not the view its action was measured in.
    const camera = action.kind !== 'set-camera' && 'camera' in action ? action.camera : undefined;
    const seen = camera === undefined ? workspace : { ...workspace, camera };
    const stepped = step(seen, action, inputsFor, seq);

    // Refused: the same object back, so history can tell that nothing happened.
    if (stepped === seen) {
        return workspace;
    }

    const next = seen === workspace ? stepped : { ...stepped, camera: workspace.camera };

    return {
        ...next,
        links: next.links.filter(link => touching(next.processes, link)),
        stores: pruned(next.stores, usedStores(next.processes)),
    };
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

// Programs that grew into others: their open windows come back as the program that replaced them.
const RENAMED: Readonly<Record<string, ProgramId>> = {
    links: 'bookmarks',
    patch: 'state',
    inspector: 'state',
};

const renamed = (program: string): string =>
    Object.entries(RENAMED).find(([old]) => old === program)?.[1] ?? program;

const processFrom = (value: unknown, inputsFor: InputsFor): Draft | null => {
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
    const program = renamed(value.program);

    if (!isProgramId(program)) {
        return null;
    }

    const store = 'store' in value && typeof value.store === 'string' ? value.store : null;

    const inputs = inputsFor(program);
    const saved = 'follows' in value ? value.follows : null;
    // Saved before follows were keyed by input: each binding goes to the first input that takes its kind.
    const entries = Array.isArray(saved)
        ? saved.flatMap(followFrom).flatMap(binding => {
              const name = Object.keys(inputs).find(key => accepts(inputs, key, binding.kind));

              return name === undefined ? [] : [[name, binding] as const];
          })
        : typeof saved === 'object' && saved !== null
          ? Object.entries(saved).flatMap(([name, entry]) =>
                followFrom(entry)
                    .filter(binding => accepts(inputs, name, binding.kind))
                    .map(binding => [name, binding] as const),
            )
          : [];

    return {
        id: value.id,
        program,
        follows: { ...initialFollows(inputs), ...Object.fromEntries(entries) },
        frame,
        // Saved before stores: a private window keeps its own id, which is what its settings are keyed by.
        store: store ?? (HOLDING[program]?.sharing === 'private' ? value.id : program),
        measured: { width: measured.width, height: measured.height },
    };
};

const followFrom = (value: unknown): Follow[] => {
    if (typeof value !== 'object' || value === null || !('store' in value)) {
        return [];
    }

    const { store } = value;
    // Saved before bindings had kinds, a follow named the program: following a timeline meant its clock.
    const kind =
        'kind' in value
            ? value.kind
            : 'program' in value && value.program === 'timeline'
              ? 'playback'
              : null;
    const binding =
        typeof kind === 'string' && typeof store === 'string' ? progressBinding(kind, store) : null;

    return binding === null ? [] : [binding];
};

const storeFrom = (value: unknown): StoreEntry[] => {
    if (typeof value !== 'object' || value === null) {
        return [];
    }

    if (!('id' in value && 'program' in value && 'name' in value)) {
        return [];
    }

    const { id, program, name } = value;
    const copy = 'copy' in value && typeof value.copy === 'string' ? value.copy : null;

    return typeof id === 'string' &&
        typeof program === 'string' &&
        isProgramId(program) &&
        typeof name === 'string'
        ? [{ id, program, name, kept: !('kept' in value) || value.kept !== false, copy }]
        : [];
};

// Every bound store gets an entry, so a window never points at a store the chip cannot name.
const enrolled = (
    stores: readonly StoreEntry[],
    processes: readonly Process[],
): readonly StoreEntry[] =>
    processes.reduce(
        (all, { id, program, store }) =>
            ensured(
                all,
                store === program
                    ? mainStore(program)
                    : { id: store, program, name: id.replace('-', ' '), kept: false, copy: null },
            ),
        stores,
    );

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

export const parseWorkspace = (value: unknown, inputsFor: InputsFor): Workspace | null => {
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

    const drafts = stored
        .map(value => processFrom(value, inputsFor))
        .filter(process => process !== null);
    const links =
        'links' in value && Array.isArray(value.links) ? value.links.flatMap(linkFrom) : [];

    const stores =
        'stores' in value && Array.isArray(value.stores) ? value.stores.flatMap(storeFrom) : [];
    const made = Math.max(
        ('made' in value ? finite(value.made) : null) ?? 0,
        ...stores.map(({ id }) => Number(/^store-(\d+)$/.exec(id)?.[1] ?? 0)),
    );

    const initial = (process: Draft, name: string): Follow | null => {
        const definition = definitionOf(inputsFor(process.program), name);

        return definition?.from === 'followed' ? definition.initial : null;
    };
    // One unknown window is dropped alone: rejecting the whole workspace for it once reset a user's layout.
    const kept = drafts
        .map(process => ({
            ...process,
            follows: Object.fromEntries(
                Object.entries(process.follows).flatMap(([name, binding]) => {
                    const target = stores.find(store => store.id === binding.store);
                    const program = sourceProgram(binding.kind);
                    const found =
                        target === undefined
                            ? binding.store === program
                            : target.program === program;
                    const fallback = found ? binding : initial(process, name);

                    return fallback === null ? [] : [[name, fallback] as const];
                }),
            ),
        }))
        .filter(ownsInputs(inputsFor));

    return {
        processes: kept,
        launched,
        camera,
        toolbar,
        minimap,
        sections,
        links: links.filter(link => touching(kept, link)),
        stores: enrolled(stores, kept),
        made,
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

type Step = {
    readonly key: string;
    // A drag's many moves join one step; a launch or a delete is always a step of its own.
    readonly joins: boolean;
};

// Only what changes the layout of the work: camera, chrome and measurements are not steps.
export const stepOf = (action: WorkspaceAction): Step | null => {
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
        case 'bind-store':
        case 'add-store':
        case 'rename-store':
        case 'remove-store':
        case 'replace':
        case 'prune-stores':
        case 'follow':
        case 'unfollow':
        case 'add-section':
        case 'rename-section':
        case 'remove-section':
            return { key: action.kind, joins: false };
        default:
            return null;
    }
};

const programOf = (workspace: Workspace, id: ProcessId): string =>
    workspace.processes.find(process => process.id === id)?.program ?? 'window';

const storeName = (workspace: Workspace, id: string): string =>
    workspace.stores.find(store => store.id === id)?.name ?? id;

const sectionName = (workspace: Workspace, id: string): string =>
    workspace.sections.find(section => section.id === id)?.name ?? 'section';

// Read against the workspace before the step, which still holds what the step removes.
export const labelOf = (action: WorkspaceAction, before: Workspace): string => {
    switch (action.kind) {
        case 'launch':
            return `Opened ${action.program}`;
        case 'quit':
            return `Closed ${programOf(before, action.id)}`;
        case 'close-others':
            return 'Closed all other windows';
        case 'toggle-link':
            return before.links.some(link => sameLink(link, action.a, action.b))
                ? 'Detached windows'
                : 'Attached windows';
        case 'bind-store':
            return `Switched ${programOf(before, action.id)} to ${storeName(before, action.store)}`;
        case 'add-store':
            return action.copy
                ? `Forked ${programOf(before, action.id)} state`
                : `New ${programOf(before, action.id)} state`;
        case 'rename-store':
            return `Renamed state to ${action.name.trim()}`;
        case 'remove-store':
            return `Deleted state ${storeName(before, action.store)}`;
        case 'replace':
            return `Turned ${programOf(before, action.id)} into ${action.program}`;
        case 'prune-stores':
            return 'Pruned unused states';
        case 'follow':
            return `Set ${programOf(before, action.id)} ${action.input} to follow ${storeName(before, action.store)}`;
        case 'unfollow':
            return `Set ${programOf(before, action.id)} ${action.input} to follow nothing`;
        case 'move':
            return `Moved ${programOf(before, action.id)}`;
        case 'resize':
            return `Resized ${programOf(before, action.id)}`;
        case 'add-section':
            return 'Added a section';
        case 'move-section':
            return `Moved section ${sectionName(before, action.id)}`;
        case 'resize-section':
            return `Resized section ${sectionName(before, action.id)}`;
        case 'rename-section':
            return `Renamed section to ${action.name.trim()}`;
        case 'remove-section':
            return `Deleted section ${sectionName(before, action.id)}`;
        default:
            return action.kind;
    }
};

// Undoing restores where things were, not where you are looking: the camera and chrome stay put.
export const keepingView = (restored: Workspace, current: Workspace): Workspace => ({
    ...restored,
    camera: current.camera,
    toolbar: current.toolbar,
    minimap: current.minimap,
    drift: null,
});

// What an action reads from the moment it was made travels with it, so replaying the log without an earlier step does it the same.
export const settledAction = (workspace: Workspace, action: WorkspaceAction): WorkspaceAction => {
    switch (action.kind) {
        case 'launch':
            return { ...action, camera: workspace.camera, order: workspace.launched + 1 };
        case 'add-section':
        case 'move-section':
        case 'resize-section':
        case 'move':
        case 'resize':
            return { ...action, camera: workspace.camera };
        default:
            return action;
    }
};
