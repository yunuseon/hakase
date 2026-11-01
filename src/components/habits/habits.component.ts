import { concat, EMPTY, merge, of, timer, type Observable } from 'rxjs';
import { filter, map, mergeMap, scan, share, switchMap, take, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import type { HabitCommand, HabitRow, HabitsView } from './habits.ts';
import css from './habits.css?inline';

const sheet = styleSheet(css);

const ARM_MS = 3000;

const TEMPLATE = `
    <div class="scroll"><div class="grid"></div></div>
    <p class="empty">No habits yet.</p>
    <form class="add">
        <input class="draft" type="text" placeholder="New habit" aria-label="new habit" autocomplete="off" />
        <button class="submit" type="submit">Add</button>
    </form>
`;

type Arming = {
    readonly armed: string | null;
    readonly at: number;
    readonly fire: string | null;
};

const dataOf = (target: EventTarget | null, key: string): string | undefined => {
    const element = target instanceof Element ? target.closest(`[data-${key}]`) : null;

    return element instanceof HTMLElement ? element.dataset[key] : undefined;
};

const rowOf = (id: string): HTMLElement => {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset['row'] = id;

    const name = document.createElement('input');
    name.className = 'name';
    name.dataset['name'] = id;
    name.autocomplete = 'off';
    name.setAttribute('aria-label', 'habit name');

    const cells = document.createElement('div');
    cells.className = 'cells';

    const streak = document.createElement('span');
    streak.className = 'streak';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.dataset['remove'] = id;
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'delete habit; click twice');

    row.append(name, cells, streak, remove);

    return row;
};

export class HksHabits extends HTMLElement {
    readonly commands$: Observable<HabitCommand>;

    private readonly shadow: ShadowRoot;
    private readonly submitted$: Observable<string>;
    private readonly arming$: Observable<Arming>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        const grid = requireChild(shadow, '.grid');
        const form = requireElement(shadow, '.add', HTMLFormElement);
        const draft = requireElement(shadow, '.draft', HTMLInputElement);

        // One listener, shared: the draft is read once, before anyone clears it.
        this.submitted$ = fromElementEvent$(form, 'submit').pipe(
            map(event => {
                // Not a page navigation: the form exists for Enter, not to be sent anywhere.
                event.preventDefault();

                return draft.value;
            }),
            share(),
        );

        // Shared: the armed button's look and the removal must read one sequence of clicks.
        this.arming$ = fromElementEvent$(grid, 'click').pipe(
            mergeMap(event => {
                const id = dataOf(event.target, 'remove');

                return id === undefined ? EMPTY : of({ id, at: event.timeStamp });
            }),
            scan(
                (state: Arming, { id, at }): Arming =>
                    state.armed === id && at - state.at < ARM_MS
                        ? { armed: null, at, fire: id }
                        : { armed: id, at, fire: null },
                { armed: null, at: 0, fire: null },
            ),
            share(),
        );

        this.commands$ = merge(
            this.submitted$.pipe(map((name): HabitCommand => ({ kind: 'add', name }))),
            fromElementEvent$(grid, 'click').pipe(
                mergeMap(({ target }): Observable<HabitCommand> => {
                    const cell = target instanceof Element ? target.closest('[data-day]') : null;
                    const id = dataOf(target, 'cell');
                    const day = cell instanceof HTMLElement ? cell.dataset['day'] : undefined;

                    return id === undefined || day === undefined
                        ? EMPTY
                        : of({ kind: 'toggle', id, day });
                }),
            ),
            fromElementEvent$(grid, 'change').pipe(
                mergeMap(({ target }): Observable<HabitCommand> => {
                    const id = dataOf(target, 'name');

                    return target instanceof HTMLInputElement && id !== undefined
                        ? of({ kind: 'rename', id, name: target.value })
                        : EMPTY;
                }),
            ),
            this.arming$.pipe(
                mergeMap(({ fire }): Observable<HabitCommand> =>
                    fire === null ? EMPTY : of({ kind: 'remove', id: fire }),
                ),
            ),
        );
    }

    connect$(view$: Observable<HabitsView>): Observable<void> {
        const shadow = this.shadow;
        const scroll = requireChild(shadow, '.scroll');
        const grid = requireChild(shadow, '.grid');
        const form = requireElement(shadow, '.add', HTMLFormElement);
        const head = document.createElement('div');
        head.className = 'row head';

        return merge(
            view$.pipe(
                tap(({ columns, rows }) => {
                    this.toggleAttribute('data-empty', rows.length === 0);
                    this.style.setProperty('--days', String(columns.length));

                    const days = document.createElement('div');
                    days.className = 'cells';
                    days.replaceChildren(
                        ...columns.map(({ weekday, date, today }) => {
                            const label = document.createElement('span');
                            label.className = 'day';
                            label.toggleAttribute('data-today', today);
                            label.innerHTML = `<b></b><i></i>`;
                            label.querySelector('b')?.append(weekday);
                            label.querySelector('i')?.append(date);

                            return label;
                        }),
                    );
                    head.replaceChildren(
                        document.createElement('span'),
                        days,
                        document.createElement('span'),
                        document.createElement('span'),
                    );

                    const active = shadow.activeElement;
                    const existing = new Map(
                        [...grid.querySelectorAll('[data-row]')]
                            .filter(row => row instanceof HTMLElement)
                            .map(row => [row.dataset['row'], row]),
                    );
                    const shown = rows.map(row => {
                        const element = existing.get(row.id) ?? rowOf(row.id);
                        fillRow(
                            element,
                            row,
                            columns.map(({ day }) => day),
                            active,
                        );

                        return element;
                    });
                    const current = [...grid.children];
                    const wanted = [head, ...shown];

                    // Only when the rows differ: moving a node drops the focus of a name being typed.
                    if (
                        current.length !== wanted.length ||
                        wanted.some((row, index) => current[index] !== row)
                    ) {
                        grid.replaceChildren(...wanted);
                    }

                    // The rebuilt cells lose focus, so the one that had it gets it back.
                    if (active instanceof HTMLElement && !active.isConnected) {
                        const key = `${active.dataset['cell'] ?? ''}|${active.dataset['day'] ?? ''}`;
                        const replacement = [...grid.querySelectorAll('.cell')].find(
                            cell =>
                                cell instanceof HTMLElement &&
                                `${cell.dataset['cell'] ?? ''}|${cell.dataset['day'] ?? ''}` ===
                                    key,
                        );

                        if (replacement instanceof HTMLElement) {
                            replacement.focus();
                        }
                    }
                }),
            ),
            view$.pipe(
                filter(({ rows }) => rows.length > 0),
                take(1),
                tap(() => {
                    scroll.scrollLeft = scroll.scrollWidth;
                }),
            ),
            this.submitted$.pipe(
                tap(() => {
                    form.reset();
                }),
            ),
            this.arming$.pipe(
                switchMap(({ armed }) =>
                    armed === null
                        ? of(null)
                        : concat(of(armed), timer(ARM_MS).pipe(map(() => null))),
                ),
                tap(armed => {
                    for (const button of grid.querySelectorAll('.remove')) {
                        button.toggleAttribute(
                            'data-armed',
                            button instanceof HTMLElement && button.dataset['remove'] === armed,
                        );
                    }
                }),
            ),
            fromElementEvent$(grid, 'keydown').pipe(
                tap(event => {
                    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
                        event.preventDefault();
                        event.target.blur();
                    }
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

const fillRow = (
    row: HTMLElement,
    { id, name, cells, streak }: HabitRow,
    days: readonly string[],
    active: Element | null,
): void => {
    const input = row.querySelector('.name');
    const list = row.querySelector('.cells');
    const count = row.querySelector('.streak');

    // Not while focused: that would overwrite a name being typed with another window's edit.
    if (input instanceof HTMLInputElement && input !== active) {
        input.value = name;
    }

    list?.replaceChildren(
        ...cells.map((done, index) => {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'cell';
            cell.dataset['cell'] = id;
            cell.dataset['day'] = days[index] ?? '';
            cell.setAttribute('aria-pressed', String(done));
            cell.setAttribute('aria-label', `${name}, ${days[index] ?? ''}`);

            return cell;
        }),
    );

    if (count !== null) {
        count.textContent = streak > 0 ? `${streak}🔥` : '';
        count.setAttribute('title', `${streak} day streak`);
    }
};

customElements.define('hks-habits', HksHabits);
