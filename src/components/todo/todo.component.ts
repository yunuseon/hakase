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
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import { dropIndex, sameTodos, type Drag, type Todo, type TodoCommand } from './todo.ts';
import css from './todo.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <form class="add">
        <input class="draft" type="text" placeholder="Add a task" aria-label="new task" autocomplete="off" />
        <button class="submit" type="submit" aria-label="add task">Add</button>
    </form>
    <ul class="items" aria-label="tasks"></ul>
    <p class="empty">Nothing to do.</p>
    <footer class="foot">
        <span class="left"></span>
        <button class="clear" type="button">Clear done</button>
    </footer>
`;

const itemOf = ({ id, text, done }: Todo): HTMLElement => {
    const item = document.createElement('li');
    item.className = 'item';
    item.dataset['id'] = id;
    item.toggleAttribute('data-done', done);

    const grip = document.createElement('button');
    grip.type = 'button';
    grip.className = 'grip';
    grip.dataset['grip'] = id;
    grip.title = 'drag, or focus and press ↑ ↓, to reorder';
    grip.setAttribute('aria-label', `move "${text}"; arrow keys reorder`);

    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'check';
    check.checked = done;
    check.dataset['toggle'] = id;
    check.setAttribute('aria-label', done ? `mark "${text}" not done` : `mark "${text}" done`);

    const label = document.createElement('span');
    label.className = 'text';
    label.textContent = text;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.dataset['remove'] = id;
    remove.textContent = '×';
    remove.setAttribute('aria-label', `delete "${text}"`);

    item.append(grip, check, label, remove);

    return item;
};

const dataOf = (target: EventTarget | null, key: string): string | undefined => {
    const element = target instanceof Element ? target.closest(`[data-${key}]`) : null;

    return element instanceof HTMLElement ? element.dataset[key] : undefined;
};

const ENDS = ['pointerup', 'pointercancel'] as const;

export class HksTodo extends HTMLElement {
    readonly commands$: Observable<TodoCommand>;

    private readonly drags$: Observable<Drag>;
    private readonly shadow: ShadowRoot;
    private readonly form: HTMLFormElement;
    private readonly submitted$: Observable<string>;
    private readonly items: HTMLElement;
    private readonly left: HTMLElement;
    private readonly clear: HTMLButtonElement;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.form = requireElement(shadow, '.add', HTMLFormElement);
        this.items = requireChild(shadow, '.items');
        this.left = requireChild(shadow, '.left');
        this.clear = requireElement(shadow, '.clear', HTMLButtonElement);
        const draft = requireElement(shadow, '.draft', HTMLInputElement);

        // One listener, shared: the draft is read once, before anyone clears it.
        this.submitted$ = fromElementEvent$(this.form, 'submit').pipe(
            map(event => {
                // Not a page navigation: the form exists for Enter, not to be sent anywhere.
                event.preventDefault();

                return draft.value;
            }),
            share(),
        );

        const middlesExcept = (id: string): readonly number[] =>
            [...this.items.children].flatMap(row => {
                if (!(row instanceof HTMLElement) || row.dataset['id'] === id) {
                    return [];
                }

                const { top, height } = row.getBoundingClientRect();

                return [top + height / 2];
            });

        // Shared: the indicator in connect$ and the move in commands$ must read one gesture, not two.
        this.drags$ = fromElementEvent$(this.items, 'pointerdown').pipe(
            mergeMap(start => {
                const id = dataOf(start.target, 'grip');

                return id === undefined || !start.isPrimary || start.button !== 0
                    ? EMPTY
                    : of({ start, id });
            }),
            switchMap(({ start, id }) => {
                // Otherwise the press starts a text selection across the rows it passes.
                start.preventDefault();
                const same = (event: PointerEvent): boolean => event.pointerId === start.pointerId;
                const at = (event: PointerEvent, phase: Drag['phase']): Drag => ({
                    id,
                    to: dropIndex(event.clientY, middlesExcept(id)),
                    phase,
                });

                return merge(
                    fromDocumentEvent$('pointermove').pipe(
                        filter(same),
                        startWith(start),
                        map(event => at(event, 'moving')),
                    ),
                    ...ENDS.map(kind =>
                        fromDocumentEvent$(kind).pipe(
                            filter(same),
                            map(event => at(event, kind === 'pointerup' ? 'dropped' : 'cancelled')),
                        ),
                    ),
                ).pipe(takeWhile(({ phase }) => phase === 'moving', true));
            }),
            share(),
        );

        this.commands$ = merge(
            this.submitted$.pipe(map((text): TodoCommand => ({ kind: 'add', text }))),
            fromElementEvent$(this.items, 'keydown').pipe(
                mergeMap((event): Observable<TodoCommand> => {
                    const id = dataOf(event.target, 'grip');
                    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;

                    if (id === undefined || step === 0) {
                        return EMPTY;
                    }

                    // Handled here: the canvas would otherwise read the same arrow as a section step.
                    event.preventDefault();
                    const index = [...this.items.children].findIndex(
                        row => row instanceof HTMLElement && row.dataset['id'] === id,
                    );

                    return index < 0 ? EMPTY : of({ kind: 'move', id, to: index + step });
                }),
            ),
            this.drags$.pipe(
                mergeMap(({ id, to, phase }): Observable<TodoCommand> =>
                    phase === 'dropped' ? of({ kind: 'move', id, to }) : EMPTY,
                ),
            ),
            fromElementEvent$(this.items, 'change').pipe(
                mergeMap(({ target }): Observable<TodoCommand> => {
                    const id = dataOf(target, 'toggle');

                    return id === undefined ? EMPTY : of({ kind: 'toggle', id });
                }),
            ),
            fromElementEvent$(this.items, 'click').pipe(
                mergeMap(({ target }): Observable<TodoCommand> => {
                    const id = dataOf(target, 'remove');

                    return id === undefined ? EMPTY : of({ kind: 'remove', id });
                }),
            ),
            fromElementEvent$(this.clear, 'click').pipe(
                map((): TodoCommand => ({ kind: 'clear-done' })),
            ),
        );
    }

    connect$(todos$: Observable<readonly Todo[]>): Observable<void> {
        return merge(
            todos$.pipe(
                distinctUntilChanged(sameTodos),
                tap(todos => {
                    // Rebuilding drops focus, so a grip moved by the keyboard is focused again afterwards.
                    const focused = dataOf(this.shadow.activeElement, 'grip');
                    this.items.replaceChildren(...todos.map(itemOf));

                    if (focused !== undefined) {
                        const grip = this.items.querySelector(
                            `[data-grip="${CSS.escape(focused)}"]`,
                        );

                        if (grip instanceof HTMLElement) {
                            grip.focus();
                        }
                    }

                    const open = todos.filter(({ done }) => !done).length;
                    this.left.textContent = open === 1 ? '1 left' : `${open} left`;
                    this.clear.disabled = todos.every(({ done }) => !done);
                }),
            ),
            this.submitted$.pipe(
                tap(() => {
                    this.form.reset();
                }),
            ),
            this.drags$.pipe(
                tap(({ id, to, phase }) => {
                    const rows = [...this.items.children].filter(row => row instanceof HTMLElement);

                    for (const row of rows) {
                        row.removeAttribute('data-dragging');
                        row.removeAttribute('data-drop-before');
                        row.removeAttribute('data-drop-after');
                    }

                    if (phase !== 'moving') {
                        return;
                    }

                    const others = rows.filter(row => row.dataset['id'] !== id);
                    const dragged = rows.find(row => row.dataset['id'] === id);
                    dragged?.setAttribute('data-dragging', '');
                    const grip = dragged?.querySelector('.grip');

                    // The press is preventDefaulted, which also cancels the focus a click would give the grip.
                    if (grip instanceof HTMLElement && grip !== this.shadow.activeElement) {
                        grip.focus();
                    }
                    (others[to] ?? others.at(-1))?.setAttribute(
                        to < others.length ? 'data-drop-before' : 'data-drop-after',
                        '',
                    );
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-todo', HksTodo);
