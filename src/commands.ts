import { isWireStyle, WIRE_STYLES, type WireStyle } from './shared/connections.ts';
import { boundsOf, areaContains } from './shared/area.ts';
import { appearances, isAppearanceName, type AppearanceName } from './appearances.ts';
import type { Command } from './components/palette/palette.ts';
import { ICONS } from './shared/ui/icons.ts';
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
    | { readonly kind: 'wires'; readonly wires: WireStyle }
    | {
          readonly kind: 'capture';
          readonly target: CaptureTarget;
          readonly store: StoreId;
          readonly text: string;
      }
    | {
          readonly kind: 'workspace';
          readonly action:
              | 'undo'
              | 'redo'
              | 'add-section'
              | 'erase-sections'
              | 'select-programs'
              | 'paste'
              | 'fit'
              | 'reset'
              | 'minimap';
      };

const WORKSPACE = [
    'undo',
    'redo',
    'add-section',
    'erase-sections',
    'select-programs',
    'paste',
    'fit',
    'reset',
    'minimap',
] as const;

const isWorkspaceCommand = (value: string): value is (typeof WORKSPACE)[number] =>
    WORKSPACE.some(command => command === value);

export const captureStores = (program: ProgramId, workspace: Workspace): readonly StoreEntry[] => {
    const front = [...workspace.processes]
        .reverse()
        .find(process => process.program === program)?.store;
    const rank = ({ id }: StoreEntry) => (id === front ? 0 : id === program ? 1 : 2);

    return [...withMain(program, workspace.stores)].sort(
        (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
    );
};

const command = (
    group: string,
    id: string,
    label: string,
    icon: string | null,
    hint = '',
): Command => ({ id, label, hint, keyword: null, group, icon });

export const commandsOf = (
    programs: readonly { readonly id: ProgramId; readonly title: string; readonly icon: string }[],
    workspace: Workspace,
): readonly Command[] => [
    ...CAPTURES.flatMap(({ target, program, label }) =>
        captureStores(program, workspace).map(({ id, name }) => ({
            id: `capture:${target}:${id}`,
            label: `${label} ${name}`,
            hint: `${target} …`,
            keyword: target,
            group: 'Capture',
            icon: programs.find(each => each.id === program)?.icon ?? ICONS.add,
        })),
    ),
    ...workspace.sections.map(({ id, name }) =>
        command('Go to', `section:${id}`, name, ICONS.section),
    ),
    command('Go to', 'step:next', 'Next section', ICONS.next, '→'),
    command('Go to', 'step:previous', 'Previous section', ICONS.previous, '←'),
    command('Edit', 'workspace:undo', 'Undo', ICONS.undo, '⌘Z'),
    command('Edit', 'workspace:redo', 'Redo', ICONS.redo, '⇧⌘Z'),
    command('Edit', 'workspace:select-programs', 'Select programs', ICONS.marquee, '⇧ drag'),
    command('Edit', 'workspace:paste', 'Paste copied programs', ICONS.paste, '⌘V'),
    command('Edit', 'workspace:add-section', 'Paint section area', ICONS.area),
    command('Edit', 'workspace:erase-sections', 'Erase section area', ICONS.erase),
    command('View', 'workspace:fit', 'Fit everything in view', ICONS.fit),
    command('View', 'workspace:reset', 'Zoom to 100%', ICONS.zoomIn, '⌘0'),
    command('View', 'workspace:minimap', 'Expand or collapse the map', ICONS.collapse),
    ...Object.keys(appearances).map(name =>
        command('Appearance', `look:${name}`, `Look: ${name}`, ICONS.look),
    ),
    ...WIRE_STYLES.map(style =>
        command('Appearance', `wires:${style}`, `Draw wires as ${style}`, ICONS.wire),
    ),
    ...programs.map(({ id, title, icon }) =>
        command('Create', `launch:${id}`, `New ${title}`, icon),
    ),
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
        case 'wires':
            return isWireStyle(value) ? { kind, wires: value } : null;
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
    const ordered = [...sections].sort(
        (a, b) =>
            boundsOf(a.rects).y - boundsOf(b.rects).y || boundsOf(a.rects).x - boundsOf(b.rects).x,
    );
    const centre = worldAt(camera, centreOf(viewport));
    const distance = ({ rects }: Section): number =>
        Math.min(
            ...rects.map(rect =>
                Math.hypot(
                    Math.max(rect.x - centre.x, 0, centre.x - rect.x - rect.width),
                    Math.max(rect.y - centre.y, 0, centre.y - rect.y - rect.height),
                ),
            ),
        );
    const nearest = ordered.reduce<Section | null>(
        (best, section) => (best === null || distance(section) < distance(best) ? section : best),
        null,
    );

    if (nearest === null) {
        return null;
    }

    const inside = areaContains(nearest.rects, centre);
    const index = ordered.indexOf(nearest);
    const step = inside ? (direction === 'next' ? 1 : -1) : 0;

    return ordered[(index + step + ordered.length) % ordered.length]?.id ?? null;
};

const workspaceAction = (
    action: Extract<Picked, { readonly kind: 'workspace' }>['action'],
    viewport: Extent,
): WorkspaceAction | null => {
    switch (action) {
        case 'undo':
        case 'redo':
            return { kind: action };
        case 'add-section':
            return { kind: 'add-section', viewport };
        case 'erase-sections':
        case 'select-programs':
        case 'paste':
            return null;
        case 'fit':
            return { kind: 'zoom-step', command: 'fit', viewport };
        case 'reset':
            return { kind: 'zoom-step', command: 'reset', viewport };
        case 'minimap':
            return { kind: 'toggle-minimap' };
    }
};

export const pickedAction = (picked: Picked, viewport: Extent): WorkspaceAction | null => {
    switch (picked.kind) {
        case 'workspace':
            return workspaceAction(picked.action, viewport);
        default:
            return null;
    }
};
