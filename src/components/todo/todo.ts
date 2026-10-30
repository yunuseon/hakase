export type Todo = {
    readonly id: string;
    readonly text: string;
    readonly done: boolean;
};

export type TodoList = {
    readonly items: readonly Todo[];
    // Monotone, so a deleted item's id is never handed out again.
    readonly made: number;
};

export type TodoCommand =
    | { readonly kind: 'add'; readonly text: string }
    | { readonly kind: 'toggle'; readonly id: string }
    | { readonly kind: 'remove'; readonly id: string }
    // `to` counts positions in the list without the moved item, which is what a drop indicates.
    | { readonly kind: 'move'; readonly id: string; readonly to: number }
    | { readonly kind: 'clear-done' };

export const emptyTodos: TodoList = { items: [], made: 0 };

export const reduceTodos = (list: TodoList, command: TodoCommand): TodoList => {
    switch (command.kind) {
        case 'add': {
            const text = command.text.trim();
            const made = list.made + 1;

            return text === ''
                ? list
                : { made, items: [...list.items, { id: `todo-${made}`, text, done: false }] };
        }
        case 'toggle':
            return {
                ...list,
                items: list.items.map(item =>
                    item.id === command.id ? { ...item, done: !item.done } : item,
                ),
            };
        case 'remove':
            return { ...list, items: list.items.filter(({ id }) => id !== command.id) };
        case 'move': {
            const moved = list.items.find(({ id }) => id === command.id);

            if (moved === undefined) {
                return list;
            }

            const rest = list.items.filter(({ id }) => id !== command.id);
            const to = Math.min(Math.max(Math.round(command.to), 0), rest.length);

            return { ...list, items: [...rest.slice(0, to), moved, ...rest.slice(to)] };
        }
        case 'clear-done':
            return { ...list, items: list.items.filter(({ done }) => !done) };
    }
};

export const dropIndex = (y: number, middles: readonly number[]): number =>
    middles.filter(middle => middle < y).length;

export type Drag = {
    readonly id: string;
    readonly to: number;
    readonly phase: 'moving' | 'dropped' | 'cancelled';
};

export const sameTodos = (a: readonly Todo[], b: readonly Todo[]): boolean =>
    a.length === b.length &&
    a.every((item, index) => {
        const other = b[index];

        return (
            other !== undefined &&
            item.id === other.id &&
            item.text === other.text &&
            item.done === other.done
        );
    });

const todoFrom = (value: unknown): Todo | null => {
    if (typeof value !== 'object' || value === null) {
        return null;
    }

    if (!('id' in value && 'text' in value && 'done' in value)) {
        return null;
    }

    const { id, text, done } = value;

    return typeof id === 'string' && typeof text === 'string' && typeof done === 'boolean'
        ? { id, text, done }
        : null;
};

export const parseTodos = (value: unknown): TodoList => {
    if (typeof value !== 'object' || value === null || !('items' in value && 'made' in value)) {
        return emptyTodos;
    }

    const { items, made } = value;

    if (!Array.isArray(items) || typeof made !== 'number' || !Number.isInteger(made)) {
        return emptyTodos;
    }

    const kept = items.map(todoFrom).filter(item => item !== null);

    return { items: kept, made: Math.max(made, kept.length) };
};
