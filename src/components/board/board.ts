export const STEPS = ['up', 'down', 'left', 'right'] as const;
export type Step = (typeof STEPS)[number];

export type Card = {
    readonly id: string;
    readonly text: string;
};

export type Column = {
    readonly id: string;
    readonly title: string;
    readonly cards: readonly Card[];
};

export type Board = {
    readonly columns: readonly Column[];
    readonly made: number;
};

export type BoardCommand =
    | { readonly kind: 'add-card'; readonly column: string; readonly text: string }
    | { readonly kind: 'edit-card'; readonly id: string; readonly text: string }
    | { readonly kind: 'remove-card'; readonly id: string }
    | { readonly kind: 'step-card'; readonly id: string; readonly step: Step }
    // `to` counts places in the target column without the moved card, which is what a drop indicates.
    | {
          readonly kind: 'move-card';
          readonly id: string;
          readonly column: string;
          readonly to: number;
      }
    | { readonly kind: 'add-column' }
    | { readonly kind: 'rename-column'; readonly id: string; readonly title: string }
    | { readonly kind: 'remove-column'; readonly id: string }
    | { readonly kind: 'move-column'; readonly id: string; readonly to: number };

export const UNTITLED = 'Untitled';

export const defaultBoard: Board = {
    columns: [
        { id: 'column-1', title: 'To do', cards: [] },
        { id: 'column-2', title: 'Doing', cards: [] },
        { id: 'column-3', title: 'Done', cards: [] },
    ],
    made: 3,
};

const inserted = <T>(items: readonly T[], item: T, to: number): readonly T[] => {
    const at = Math.min(Math.max(Math.round(to), 0), items.length);

    return [...items.slice(0, at), item, ...items.slice(at)];
};

const cardOf = (board: Board, id: string): Card | undefined =>
    board.columns.flatMap(({ cards }) => cards).find(card => card.id === id);

const withCards = (board: Board, change: (column: Column) => readonly Card[]): Board => ({
    ...board,
    columns: board.columns.map(column => ({ ...column, cards: change(column) })),
});

export const reduceBoard = (board: Board, command: BoardCommand): Board => {
    switch (command.kind) {
        case 'add-card': {
            const text = command.text.trim();
            const made = board.made + 1;

            return text === '' || !board.columns.some(({ id }) => id === command.column)
                ? board
                : {
                      made,
                      columns: board.columns.map(column =>
                          column.id === command.column
                              ? {
                                    ...column,
                                    cards: [...column.cards, { id: `card-${made}`, text }],
                                }
                              : column,
                      ),
                  };
        }
        case 'edit-card': {
            const text = command.text.trim();

            return text === ''
                ? board
                : withCards(board, ({ cards }) =>
                      cards.map(card => (card.id === command.id ? { ...card, text } : card)),
                  );
        }
        case 'remove-card':
            return withCards(board, ({ cards }) => cards.filter(({ id }) => id !== command.id));
        case 'step-card': {
            const move = stepped(board, command.id, command.step);

            return move === null ? board : reduceBoard(board, move);
        }
        case 'move-card': {
            const moved = cardOf(board, command.id);

            if (moved === undefined || !board.columns.some(({ id }) => id === command.column)) {
                return board;
            }

            return withCards(board, ({ id, cards }) => {
                const rest = cards.filter(card => card.id !== command.id);

                return id === command.column ? inserted(rest, moved, command.to) : rest;
            });
        }
        case 'add-column': {
            const made = board.made + 1;

            return {
                made,
                columns: [...board.columns, { id: `column-${made}`, title: UNTITLED, cards: [] }],
            };
        }
        case 'rename-column': {
            const title = command.title.trim();

            return {
                ...board,
                columns: board.columns.map(column =>
                    column.id === command.id
                        ? { ...column, title: title === '' ? UNTITLED : title }
                        : column,
                ),
            };
        }
        case 'remove-column':
            return {
                ...board,
                columns: board.columns.filter(
                    ({ id, cards }) => id !== command.id || cards.length > 0,
                ),
            };
        case 'move-column': {
            const moved = board.columns.find(({ id }) => id === command.id);

            return moved === undefined
                ? board
                : {
                      ...board,
                      columns: inserted(
                          board.columns.filter(({ id }) => id !== command.id),
                          moved,
                          command.to,
                      ),
                  };
        }
    }
};

export type Lane = {
    readonly id: string;
    readonly left: number;
    readonly right: number;
    readonly middles: readonly number[];
};

export type Target = {
    readonly column: string;
    readonly to: number;
};

const distanceTo = (x: number, { left, right }: Lane): number =>
    x < left ? left - x : x > right ? x - right : 0;

export const dropTarget = (x: number, y: number, lanes: readonly Lane[]): Target | null => {
    const lane = lanes.reduce<Lane | null>(
        (best, candidate) =>
            best === null || distanceTo(x, candidate) < distanceTo(x, best) ? candidate : best,
        null,
    );

    return lane === null
        ? null
        : { column: lane.id, to: lane.middles.filter(middle => middle < y).length };
};

export type Where = {
    readonly column: number;
    readonly index: number;
};

export const placeOf = (board: Board, id: string): Where | null => {
    const column = board.columns.findIndex(({ cards }) => cards.some(card => card.id === id));
    const index = board.columns[column]?.cards.findIndex(card => card.id === id) ?? -1;

    return column < 0 || index < 0 ? null : { column, index };
};

export const stepped = (board: Board, id: string, step: Step): BoardCommand | null => {
    const place = placeOf(board, id);

    if (place === null) {
        return null;
    }

    const across = step === 'left' ? -1 : step === 'right' ? 1 : 0;
    const target = board.columns[place.column + across];

    if (target === undefined) {
        return null;
    }

    const to =
        across === 0
            ? place.index + (step === 'up' ? -1 : 1)
            : Math.min(place.index, target.cards.length);

    return to < 0 || (across === 0 && to >= target.cards.length)
        ? null
        : { kind: 'move-card', id, column: target.id, to };
};

const cardFrom = (value: unknown): Card | null => {
    if (typeof value !== 'object' || value === null || !('id' in value && 'text' in value)) {
        return null;
    }

    const { id, text } = value;

    return typeof id === 'string' && typeof text === 'string' ? { id, text } : null;
};

const columnFrom = (value: unknown): Column | null => {
    if (
        typeof value !== 'object' ||
        value === null ||
        !('id' in value && 'title' in value && 'cards' in value)
    ) {
        return null;
    }

    const { id, title, cards } = value;

    return typeof id === 'string' && typeof title === 'string' && Array.isArray(cards)
        ? { id, title, cards: cards.map(cardFrom).filter(card => card !== null) }
        : null;
};

export const parseBoard = (value: unknown): Board => {
    if (typeof value !== 'object' || value === null || !('columns' in value && 'made' in value)) {
        return defaultBoard;
    }

    const { columns, made } = value;

    if (!Array.isArray(columns) || typeof made !== 'number' || !Number.isInteger(made)) {
        return defaultBoard;
    }

    const kept = columns.map(columnFrom).filter(column => column !== null);
    const ids = kept.flatMap(({ id, cards }) => [id, ...cards.map(card => card.id)]);
    const highest = Math.max(0, ...ids.map(id => Number(/-(\d+)$/.exec(id)?.[1] ?? 0)));

    return { columns: kept, made: Math.max(made, highest) };
};

export type Drag =
    | {
          readonly kind: 'card';
          readonly id: string;
          readonly target: Target | null;
          readonly phase: DragPhase;
      }
    | {
          readonly kind: 'column';
          readonly id: string;
          readonly to: number;
          readonly phase: DragPhase;
      };

export type DragPhase = 'moving' | 'dropped' | 'cancelled';

export const sameBoard = (a: Board, b: Board): boolean =>
    a.made === b.made &&
    a.columns.length === b.columns.length &&
    a.columns.every((column, index) => {
        const other = b.columns[index];

        return (
            other !== undefined &&
            column.id === other.id &&
            column.title === other.title &&
            column.cards.length === other.cards.length &&
            column.cards.every((card, at) => {
                const twin = other.cards[at];

                return twin !== undefined && card.id === twin.id && card.text === twin.text;
            })
        );
    });
