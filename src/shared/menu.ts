export type MenuItem = {
    readonly id: string;
    readonly label: string;
    readonly glyph: string;
    readonly hint?: string;
    readonly destructive?: boolean;
    readonly disabled?: boolean;
    readonly field?: { readonly placeholder: string };
};

export type MenuPick = { readonly id: string; readonly text: string | null };

export type MenuGroup = { readonly id: string; readonly items: readonly MenuItem[] };

export const DESTRUCTIVE = 'destructive';

export const ordered = (groups: readonly MenuGroup[]): readonly MenuGroup[] => {
    const kept = groups
        .map(({ id, items }) => ({ id, items: items.filter(item => item.destructive !== true) }))
        .filter(({ items }) => items.length > 0);
    const destructive = groups.flatMap(({ items }) =>
        items.filter(item => item.destructive === true),
    );

    return destructive.length === 0 ? kept : [...kept, { id: DESTRUCTIVE, items: destructive }];
};

export type Menu = { readonly open: boolean; readonly armed: string | null };

export type MenuAction =
    | { readonly kind: 'toggle' }
    | { readonly kind: 'close' }
    | { readonly kind: 'disarm' }
    | { readonly kind: 'choose'; readonly item: MenuItem };

export const closedMenu: Menu = { open: false, armed: null };

export const reduceMenu = (menu: Menu, action: MenuAction): Menu => {
    switch (action.kind) {
        case 'toggle':
            return { open: !menu.open, armed: null };
        case 'close':
            return closedMenu;
        case 'disarm':
            return { ...menu, armed: null };
        case 'choose':
            return action.item.disabled === true
                ? menu
                : action.item.destructive === true && menu.armed !== action.item.id
                  ? { ...menu, armed: action.item.id }
                  : closedMenu;
    }
};

export const pickedBy = (menu: Menu, action: MenuAction): string | null =>
    action.kind === 'choose' &&
    action.item.disabled !== true &&
    (action.item.destructive !== true || menu.armed === action.item.id)
        ? action.item.id
        : null;
