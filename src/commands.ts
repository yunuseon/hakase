import { appearances, isAppearanceName, type AppearanceName } from './appearances.ts';
import type { Command } from './components/palette/palette.ts';
import { centreOf, worldAt, type Camera, type Extent } from './shared/camera.ts';
import { isProgramId, type ProgramId } from './program.ts';
import { withMain, type StoreEntry, type StoreId } from './stores.ts';
import type { Section, Workspace, WorkspaceAction } from './workspace.ts';

export type Direction = 'next' | 'previous';

export const CAPTURES = [
    { target: 'ticket', program: 'tickets', label: 'Add ticket to' },
    { target: 'todo', program: 'tickets', label: 'Add to-do to' },
    { target: 'note', program: 'note', label: 'Jot a note in' },
] as const;

export type CaptureTarget = (typeof CAPTURES)[number]['target'];

const isCaptureTarget = (value: string): value is CaptureTarget =>
    CAPTURES.some(({ target }) => target === value);

export type Picked =
    | { readonly kind: 'launch'; readonly program: ProgramId }
    | { readonly kind: 'section'; readonly id: string }
    | { readonly kind: 'step'; readonly direction: Direction }
    | { readonly kind: 'look'; readonly name: AppearanceName }
    | {
          readonly kind: 'capture';
          readonly target: CaptureTarget;
          readonly store: StoreId;
          readonly text: string;
      }
    | {
          readonly kind: 'workspace';
          readonly action: 'undo' | 'redo' | 'add-section' | 'fit' | 'reset' | 'minimap';
      };

const WORKSPACE = ['undo', 'redo', 'add-section', 'fit', 'reset', 'minimap'] as const;

const isWorkspaceCommand = (value: string): value is (typeof WORKSPACE)[number] =>
    WORKSPACE.some(command => command === value);

// The frontmost window's state first, since that is the list in front of you, then Main, then by name.
export const captureStores = (program: ProgramId, workspace: Workspace): readonly StoreEntry[] => {
    const front = [...workspace.processes]
        .reverse()
        .find(process => process.program === program)?.store;
    const rank = ({ id }: StoreEntry) => (id === front ? 0 : id === program ? 1 : 2);

    return [...withMain(program, workspace.stores)].sort(
        (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
    );
};

export const commandsOf = (
    programs: readonly { readonly id: ProgramId; readonly title: string }[],
    workspace: Workspace,
): readonly Command[] => [
    ...CAPTURES.flatMap(({ target, program, label }) =>
        captureStores(program, workspace).map(({ id, name }) => ({
            id: `capture:${target}:${id}`,
            label: `${label} ${name}`,
            hint: `${target} …`,
            keyword: target,
        })),
    ),
    ...programs.map(({ id, title }) => ({
        id: `launch:${id}`,
        label: `New ${title}`,
        hint: 'open',
        keyword: null,
    })),
    ...workspace.sections.map(({ id, name }) => ({
        id: `section:${id}`,
        label: `Go to ${name}`,
        hint: 'section',
        keyword: null,
    })),
    { id: 'step:next', label: 'Next section', hint: '→', keyword: null },
    { id: 'step:previous', label: 'Previous section', hint: '←', keyword: null },
    {
        id: 'workspace:add-section',
        label: 'New section around the view',
        hint: 'section',
        keyword: null,
    },
    { id: 'workspace:undo', label: 'Undo', hint: '⌘Z', keyword: null },
    { id: 'workspace:redo', label: 'Redo', hint: '⇧⌘Z', keyword: null },
    { id: 'workspace:fit', label: 'Fit everything in view', hint: 'zoom', keyword: null },
    { id: 'workspace:reset', label: 'Zoom to 100%', hint: 'zoom', keyword: null },
    {
        id: 'workspace:minimap',
        label: 'Expand or collapse workspace controls',
        hint: 'view',
        keyword: null,
    },
    ...Object.keys(appearances).map(name => ({
        id: `look:${name}`,
        label: `Look: ${name}`,
        hint: 'appearance',
        keyword: null,
    })),
];

// Untrusted in the sense that a click target carries it: parsed, never assumed.
export const pickedOf = (id: string, text: string | null): Picked | null => {
    const [kind, value = ''] = id.split(/:(.*)/s);

    switch (kind) {
        case 'capture': {
            const [target = '', store = ''] = value.split(/:(.*)/s);

            return isCaptureTarget(target) && store !== '' && text !== null && text.trim() !== ''
                ? { kind, target, store, text: text.trim() }
                : null;
        }
        case 'launch':
            return isProgramId(value) ? { kind, program: value } : null;
        case 'section':
            return value === '' ? null : { kind, id: value };
        case 'step':
            return value === 'next' || value === 'previous' ? { kind, direction: value } : null;
        case 'look':
            return isAppearanceName(value) ? { kind, name: value } : null;
        case 'workspace':
            return isWorkspaceCommand(value) ? { kind, action: value } : null;
        default:
            return null;
    }
};

// From the section the view is in, or the nearest one when it is in none, to its neighbour in order.
export const steppedSection = (
    sections: readonly Section[],
    camera: Camera,
    viewport: Extent,
    direction: Direction,
): string | null => {
    // Reading order, not the order they were made in, which is how they are stored.
    const ordered = [...sections].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
    const centre = worldAt(camera, centreOf(viewport));
    const distance = ({ rect }: Section): number =>
        Math.hypot(rect.x + rect.width / 2 - centre.x, rect.y + rect.height / 2 - centre.y);
    const nearest = ordered.reduce<Section | null>(
        (best, section) => (best === null || distance(section) < distance(best) ? section : best),
        null,
    );

    if (nearest === null) {
        return null;
    }

    const { rect } = nearest;
    const inside =
        centre.x >= rect.x &&
        centre.x <= rect.x + rect.width &&
        centre.y >= rect.y &&
        centre.y <= rect.y + rect.height;
    const index = ordered.indexOf(nearest);
    const step = inside ? (direction === 'next' ? 1 : -1) : 0;

    return ordered[(index + step + ordered.length) % ordered.length]?.id ?? null;
};

const workspaceAction = (
    action: Extract<Picked, { readonly kind: 'workspace' }>['action'],
    viewport: Extent,
): WorkspaceAction => {
    switch (action) {
        case 'undo':
        case 'redo':
            return { kind: action };
        case 'add-section':
            return { kind: 'add-section', viewport };
        case 'fit':
            return { kind: 'zoom-step', command: 'fit', viewport };
        case 'reset':
            return { kind: 'zoom-step', command: 'reset', viewport };
        case 'minimap':
            return { kind: 'toggle-minimap' };
    }
};

// The commands that are workspace actions; launches, jumps and looks go to their own streams.
export const pickedAction = (picked: Picked, viewport: Extent): WorkspaceAction | null => {
    switch (picked.kind) {
        case 'workspace':
            return workspaceAction(picked.action, viewport);
        default:
            return null;
    }
};
