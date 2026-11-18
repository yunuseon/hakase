import { ACTIONS, isAction, type Action, type PaintEvent } from '../../model/paint.ts';
import type { MenuGroup, MenuPick } from '../../shared/menu.ts';
import { ICONS } from '../../shared/ui/icons.ts';

const LABELS: Readonly<Record<Action, string>> = {
    clear: 'Clear this frame',
    invert: 'Invert',
    soften: 'Soften',
    noise: 'Add noise',
};

const GLYPHS: Readonly<Record<Action, string>> = {
    clear: ICONS.remove,
    invert: ICONS.look,
    soften: 'M4 15c3-6 5 6 8 0s5 6 8 0',
    noise: 'M5 6h.01M12 5h.01M18 7h.01M7 12h.01M15 11h.01M6 18h.01M12 17h.01M19 16h.01',
};

export const paintMenu: readonly MenuGroup[] = [
    {
        id: 'frame',
        items: ACTIONS.map(action => ({
            id: action,
            label: LABELS[action],
            glyph: GLYPHS[action],
            destructive: action === 'clear',
        })),
    },
];

export const paintEventOf = ({ id }: MenuPick): PaintEvent[] =>
    isAction(id) ? [{ kind: 'action', action: id }] : [];
