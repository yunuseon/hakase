import { EMPTY, merge, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    share,
    startWith,
    switchMap,
    takeWhile,
    tap,
} from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import {
    dropTarget,
    sameBoard,
    type Board,
    type BoardCommand,
    type Card,
    type Column,
    type Drag,
    type DragPhase,
    type Lane,
    type Step,
} from './board.ts';
import css from './board.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <div class="scroller">
        <div class="columns"></div>
        <button class="add-column" type="button">+ column</button>
    </div>
`;

const ARROWS: Readonly<Record<string, Step>> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
};

const ENDS = ['pointerup', 'pointercancel'] as const;

type Submitted = {
    readonly form: HTMLFormElement;
    readonly column: string;
    readonly text: string;
};

const button = (className: string, key: string, id: string, label: string): HTMLButtonElement => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.dataset[key] = id;
    element.setAttribute('aria-label', label);

    return element;
};

const cardOf = (id: string): HTMLElement => {
    const item = document.createElement('li');
    item.className = 'card';
    item.dataset['card'] = id;

    const grip = button('grip', 'grip', id, 'move card');
    grip.title = 'drag, or focus and press the arrow keys, to move';

    const edit = document.createElement('textarea');
    edit.className = 'text';
    edit.dataset['edit'] = id;
    edit.rows = 1;
    edit.setAttribute('aria-label', 'card text');

    const remove = button('remove', 'remove', id, 'delete card');
    remove.textContent = '×';

    item.append(grip, edit, remove);

    return item;
};

const fillCard = (item: HTMLElement, { text }: Card, active: Element | null): void => {
    const edit = item.querySelector('.text');

    // Not while focused: that would overwrite what is being typed with another window's edit.
    if (edit instanceof HTMLTextAreaElement && edit !== active) {
        edit.value = text;
    }

    item.querySelector('.grip')?.setAttribute('aria-label', `move "${text}"; arrow keys move it`);
    item.querySelector('.remove')?.setAttribute('aria-label', `delete "${text}"`);
};

const fillColumn = (
    section: HTMLElement,
    column: Column,
    cards: readonly HTMLElement[],
    active: Element | null,
): void => {
    const title = section.querySelector('.title');
    const count = section.querySelector('.count');
    const remove = section.querySelector('.remove-column');
    const list = section.querySelector('.cards');

    if (title instanceof HTMLInputElement && title !== active) {
        title.value = column.title;
    }

    if (count !== null) {
        count.textContent = String(column.cards.length);
    }

    if (remove instanceof HTMLButtonElement) {
        remove.disabled = column.cards.length > 0;
    }

    if (list !== null) {
        ordered(list, cards);
    }
};

// Only when the order differs: moving a node drops its focus, and a click that lands on it.
const ordered = (parent: Element, children: readonly HTMLElement[]): void => {
    const current = elementsIn(parent);

    if (
        current.length !== children.length ||
        children.some((child, index) => current[index] !== child)
    ) {
        parent.replaceChildren(...children);
    }
};

const rendered = (shadow: ShadowRoot, columns: HTMLElement, board: Board): void => {
    const active = shadow.activeElement;
    const sections = new Map(
        elementsIn(columns).map(section => [section.dataset['column'], section]),
    );
    const items = new Map(
        [...shadow.querySelectorAll('.card')]
            .filter(item => item instanceof HTMLElement)
            .map(item => [item.dataset['card'], item]),
    );

    ordered(
        columns,
        board.columns.map(column => {
            const section = sections.get(column.id) ?? columnOf(column.id);
            const cards = column.cards.map(card => {
                const item = items.get(card.id) ?? cardOf(card.id);
                fillCard(item, card, active);

                return item;
            });
            fillColumn(section, column, cards, active);

            return section;
        }),
    );

    // A card moved to another column was re-inserted, which drops its focus.
    if (active instanceof HTMLElement && active.isConnected && active !== shadow.activeElement) {
        active.focus();
    }
};

const indicated = (shadow: ShadowRoot, columns: HTMLElement, drag: Drag): void => {
    const marks = ['data-dragging', 'data-drop-before', 'data-drop-after', 'data-drop-into'];

    for (const element of shadow.querySelectorAll('.column, .card')) {
        for (const mark of marks) {
            element.removeAttribute(mark);
        }
    }

    if (drag.phase !== 'moving') {
        return;
    }

    const selector = drag.kind === 'card' ? 'data-card' : 'data-column';
    const dragged = shadow.querySelector(`[${selector}="${CSS.escape(drag.id)}"]`);
    dragged?.setAttribute('data-dragging', '');
    const grip = dragged?.querySelector(drag.kind === 'card' ? '.grip' : '.column-grip');

    // The press is preventDefaulted, which also cancels the focus a click would give the grip.
    if (grip instanceof HTMLElement && grip !== shadow.activeElement) {
        grip.focus();
    }

    const mark = (others: readonly HTMLElement[], to: number, empty: Element | null): void => {
        const before = others[to];

        if (before !== undefined) {
            before.setAttribute('data-drop-before', '');
        } else if (others.length > 0) {
            others.at(-1)?.setAttribute('data-drop-after', '');
        } else {
            empty?.setAttribute('data-drop-into', '');
        }
    };

    if (drag.kind === 'column') {
        mark(
            elementsIn(columns).filter(section => section !== dragged),
            drag.to,
            null,
        );

        return;
    }

    if (drag.target === null) {
        return;
    }

    const section = shadow.querySelector(`[data-column="${CSS.escape(drag.target.column)}"]`);
    const list = section?.querySelector('.cards');
    const others = list === null || list === undefined ? [] : elementsIn(list);
    mark(
        others.filter(card => card !== dragged),
        drag.target.to,
        section ?? null,
    );
};

const columnOf = (id: string): HTMLElement => {
    const section = document.createElement('section');
    section.className = 'column';
    section.dataset['column'] = id;

    const head = document.createElement('header');
    head.className = 'head';

    const grip = button('column-grip', 'columnGrip', id, 'move column; ← → move it');
    grip.title = 'drag, or focus and press ← →, to move the column';

    const title = document.createElement('input');
    title.className = 'title';
    title.dataset['title'] = id;
    title.autocomplete = 'off';
    title.setAttribute('aria-label', 'column name');

    const count = document.createElement('span');
    count.className = 'count';

    const remove = button('remove-column', 'removeColumn', id, 'delete column');
    remove.textContent = '×';
    remove.title = 'only an empty column can be deleted';

    head.append(grip, title, count, remove);

    const cards = document.createElement('ul');
    cards.className = 'cards';

    const add = document.createElement('form');
    add.className = 'add';
    add.dataset['add'] = id;

    const draft = document.createElement('input');
    draft.className = 'draft';
    draft.placeholder = 'Add a card';
    draft.autocomplete = 'off';
    draft.setAttribute('aria-label', 'new card');
    add.append(draft);

    section.append(head, cards, add);

    return section;
};

const dataOf = (target: EventTarget | null, key: string): string | undefined => {
    const element = target instanceof Element ? target.closest(`[data-${dashed(key)}]`) : null;

    return element instanceof HTMLElement ? element.dataset[key] : undefined;
};

const dashed = (key: string): string => key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

const elementsIn = (parent: Element): HTMLElement[] =>
    [...parent.children].filter(child => child instanceof HTMLElement);

const middleY = (element: Element): number => {
    const { top, height } = element.getBoundingClientRect();

    return top + height / 2;
};

const middleX = (element: Element): number => {
    const { left, width } = element.getBoundingClientRect();

    return left + width / 2;
};

export class HksBoard extends HTMLElement {
    readonly commands$: Observable<BoardCommand>;

    private readonly shadow: ShadowRoot;
    private readonly scroller: HTMLElement;
    private readonly columns: HTMLElement;
    private readonly drags$: Observable<Drag>;
    private readonly submitted$: Observable<Submitted>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.scroller = requireChild(shadow, '.scroller');
        this.columns = requireChild(shadow, '.columns');
        const addColumn = requireChild(shadow, '.add-column');

        // One listener, shared: the draft is read once, before anyone clears it.
        this.submitted$ = fromElementEvent$(this.scroller, 'submit').pipe(
            mergeMap(event => {
                // Not a page navigation: the form exists for Enter, not to be sent anywhere.
                event.preventDefault();
                const form = event.target instanceof HTMLFormElement ? event.target : null;
                const column = form?.dataset['add'];
                const draft = form?.querySelector('.draft');

                return form === null || column === undefined || !(draft instanceof HTMLInputElement)
                    ? EMPTY
                    : of({ form, column, text: draft.value });
            }),
            share(),
        );

        const lanesExcept = (id: string): readonly Lane[] =>
            elementsIn(this.columns).flatMap(section => {
                const column = section.dataset['column'];
                const cards = section.querySelector('.cards');

                if (column === undefined || cards === null) {
                    return [];
                }

                const { left, right } = section.getBoundingClientRect();
                const middles = elementsIn(cards)
                    .filter(card => card.dataset['card'] !== id)
                    .map(middleY);

                return [{ id: column, left, right, middles }];
            });

        const columnIndex = (id: string, x: number): number =>
            elementsIn(this.columns)
                .filter(section => section.dataset['column'] !== id)
                .map(middleX)
                .filter(middle => middle < x).length;

        // Shared: the indicator in connect$ and the move in commands$ must read one gesture, not two.
        this.drags$ = fromElementEvent$(this.scroller, 'pointerdown').pipe(
            mergeMap(start => {
                const card = dataOf(start.target, 'grip');
                const column = dataOf(start.target, 'columnGrip');

                if (!start.isPrimary || start.button !== 0) {
                    return EMPTY;
                }

                return card !== undefined
                    ? of({ start, kind: 'card' as const, id: card })
                    : column !== undefined
                      ? of({ start, kind: 'column' as const, id: column })
                      : EMPTY;
            }),
            switchMap(({ start, kind, id }) => {
                // Otherwise the press starts a text selection across everything it passes.
                start.preventDefault();
                const same = (event: PointerEvent): boolean => event.pointerId === start.pointerId;
                const at = (event: PointerEvent, phase: DragPhase): Drag =>
                    kind === 'card'
                        ? {
                              kind,
                              id,
                              target: dropTarget(event.clientX, event.clientY, lanesExcept(id)),
                              phase,
                          }
                        : { kind, id, to: columnIndex(id, event.clientX), phase };

                return merge(
                    fromDocumentEvent$('pointermove').pipe(
                        filter(same),
                        startWith(start),
                        map(event => at(event, 'moving')),
                    ),
                    ...ENDS.map(end =>
                        fromDocumentEvent$(end).pipe(
                            filter(same),
                            map(event => at(event, end === 'pointerup' ? 'dropped' : 'cancelled')),
                        ),
                    ),
                ).pipe(takeWhile(({ phase }) => phase === 'moving', true));
            }),
            share(),
        );

        this.commands$ = merge(
            this.submitted$.pipe(
                map(({ column, text }): BoardCommand => ({ kind: 'add-card', column, text })),
            ),
            fromElementEvent$(this.scroller, 'change').pipe(
                mergeMap(({ target }): Observable<BoardCommand> => {
                    const card = dataOf(target, 'edit');
                    const column = dataOf(target, 'title');

                    if (target instanceof HTMLTextAreaElement && card !== undefined) {
                        return of({ kind: 'edit-card', id: card, text: target.value });
                    }

                    return target instanceof HTMLInputElement && column !== undefined
                        ? of({ kind: 'rename-column', id: column, title: target.value })
                        : EMPTY;
                }),
            ),
            fromElementEvent$(this.scroller, 'keydown').pipe(
                mergeMap((event): Observable<BoardCommand> => {
                    const step = ARROWS[event.key];
                    const card = dataOf(event.target, 'grip');
                    const column = dataOf(event.target, 'columnGrip');

                    if (step === undefined) {
                        return EMPTY;
                    }

                    if (card !== undefined) {
                        // Handled here: the canvas would otherwise read the same arrow as a section step.
                        event.preventDefault();

                        return of({ kind: 'step-card', id: card, step });
                    }

                    if (column === undefined || (step !== 'left' && step !== 'right')) {
                        return EMPTY;
                    }

                    event.preventDefault();
                    const index = elementsIn(this.columns).findIndex(
                        section => section.dataset['column'] === column,
                    );

                    return index < 0
                        ? EMPTY
                        : of({
                              kind: 'move-column',
                              id: column,
                              to: index + (step === 'left' ? -1 : 1),
                          });
                }),
            ),
            this.drags$.pipe(
                mergeMap((drag): Observable<BoardCommand> => {
                    if (drag.phase !== 'dropped') {
                        return EMPTY;
                    }

                    if (drag.kind === 'column') {
                        return of({ kind: 'move-column', id: drag.id, to: drag.to });
                    }

                    return drag.target === null
                        ? EMPTY
                        : of({ kind: 'move-card', id: drag.id, ...drag.target });
                }),
            ),
            fromElementEvent$(this.scroller, 'click').pipe(
                mergeMap(({ target }): Observable<BoardCommand> => {
                    const card = dataOf(target, 'remove');
                    const column = dataOf(target, 'removeColumn');

                    return card !== undefined
                        ? of({ kind: 'remove-card', id: card })
                        : column !== undefined
                          ? of({ kind: 'remove-column', id: column })
                          : EMPTY;
                }),
            ),
            fromElementEvent$(addColumn, 'click').pipe(
                map((): BoardCommand => ({ kind: 'add-column' })),
            ),
        );
    }

    connect$(board$: Observable<Board>): Observable<void> {
        return merge(
            board$.pipe(
                distinctUntilChanged(sameBoard),
                tap(board => {
                    rendered(this.shadow, this.columns, board);
                }),
            ),
            this.submitted$.pipe(
                tap(({ form }) => {
                    form.reset();
                }),
            ),
            fromElementEvent$(this.scroller, 'keydown').pipe(
                tap(event => {
                    const { target } = event;
                    const editing =
                        target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;

                    if (
                        editing &&
                        event.key === 'Enter' &&
                        !event.shiftKey &&
                        !target.matches('.draft')
                    ) {
                        event.preventDefault();
                        target.blur();
                    }
                }),
            ),
            this.drags$.pipe(
                tap(drag => {
                    indicated(this.shadow, this.columns, drag);
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-board', HksBoard);
