import { appearances, isAppearanceName, type AppearanceName } from './appearances.ts';
import type { Command } from './components/palette/palette.ts';
import { isPlacement, type Placement } from './components/toolbar/toolbar.ts';
import { centreOf, worldAt, type Camera, type Extent } from './shared/camera.ts';
import { isProgramId, type ProgramId } from './program.ts';
import type { Section, WorkspaceAction } from './workspace.ts';

export type Direction = 'next' | 'previous';

export type Picked =
    | { readonly kind: 'launch'; readonly program: ProgramId }
    | { readonly kind: 'section'; readonly id: string }
    | { readonly kind: 'step'; readonly direction: Direction }
    | { readonly kind: 'look'; readonly name: AppearanceName }
    | { readonly kind: 'toolbar'; readonly placement: Placement }
    | {
          readonly kind: 'workspace';
          readonly action: 'undo' | 'redo' | 'add-section' | 'fit' | 'reset' | 'minimap';
      };

const WORKSPACE = ['undo', 'redo', 'add-section', 'fit', 'reset', 'minimap'] as const;

const isWorkspaceCommand = (value: string): value is (typeof WORKSPACE)[number] =>
    WORKSPACE.some(command => command === value);

export const commandsOf = (
    programs: readonly { readonly id: ProgramId; readonly title: string }[],
    sections: readonly Section[],
): readonly Command[] => [
    ...programs.map(({ id, title }) => ({
        id: `launch:${id}`,
        label: `New ${title}`,
        hint: 'open',
    })),
    ...sections.map(({ id, name }) => ({
        id: `section:${id}`,
        label: `Go to ${name}`,
        hint: 'section',
    })),
    { id: 'step:next', label: 'Next section', hint: '→' },
    { id: 'step:previous', label: 'Previous section', hint: '←' },
    { id: 'workspace:add-section', label: 'New section around the view', hint: 'section' },
    { id: 'workspace:undo', label: 'Undo', hint: '⌘Z' },
    { id: 'workspace:redo', label: 'Redo', hint: '⇧⌘Z' },
    { id: 'workspace:fit', label: 'Fit everything in view', hint: 'zoom' },
    { id: 'workspace:reset', label: 'Zoom to 100%', hint: 'zoom' },
    { id: 'workspace:minimap', label: 'Show or hide the map', hint: 'view' },
    ...Object.keys(appearances).map(name => ({
        id: `look:${name}`,
        label: `Look: ${name}`,
        hint: 'appearance',
    })),
    ...(['top', 'bottom', 'left', 'right', 'float'] as const).map(placement => ({
        id: `toolbar:${placement}`,
        label: `Toolbar: ${placement === 'float' ? 'own window' : placement}`,
        hint: 'toolbar',
    })),
];

// Untrusted in the sense that a click target carries it: parsed, never assumed.
export const pickedOf = (id: string): Picked | null => {
    const [kind, value = ''] = id.split(/:(.*)/s);

    switch (kind) {
        case 'launch':
            return isProgramId(value) ? { kind, program: value } : null;
        case 'section':
            return value === '' ? null : { kind, id: value };
        case 'step':
            return value === 'next' || value === 'previous' ? { kind, direction: value } : null;
        case 'look':
            return isAppearanceName(value) ? { kind, name: value } : null;
        case 'toolbar':
            return isPlacement(value) ? { kind, placement: value } : null;
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
        case 'toolbar':
            return { kind: 'place-toolbar', placement: picked.placement };
        case 'workspace':
            return workspaceAction(picked.action, viewport);
        default:
            return null;
    }
};
