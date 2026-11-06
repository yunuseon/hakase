import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { withValue } from '../../lib/lit.ts';
import { ref } from 'lit-html/directives/ref.js';

import { renderView, displayValue, type RenderView } from '../../lib/lit.ts';
import { concat, EMPTY, merge, of, timer, type Observable } from 'rxjs';
import { filter, map, mergeMap, scan, share, switchMap, take, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import type { HabitCommand, HabitsView } from './habits.ts';
import css from './habits.css?inline';

const sheet = styleSheet(css);

const ARM_MS = 3000;

const TEMPLATE = (view: HabitsView) =>
    html`<div class="scroll">
            <div class="grid">
                <div class="row head">
                    <span></span>
                    <div class="cells">
                        ${repeat(
                            view.columns,
                            (_item, index) => index,
                            column =>
                                html`<span
                                    class="day"
                                    data-today=${ifDefined(column.today ? '' : undefined)}
                                    ><b>${column.weekday}</b><i>${column.date}</i></span
                                >`,
                        )}
                    </div>
                    <span></span><span></span>
                </div>
                ${repeat(
                    view.rows.map(row => row.id),
                    item => item,
                    id =>
                        withValue(
                            view.rows.find(row => row.id === id),
                            row =>
                                html`<div class="row" data-row=${ifDefined(id)}>
                                    <input
                                        class="ui-field name"
                                        data-name=${ifDefined(id)}
                                        autocomplete="off"
                                        aria-label="habit name"
                                        ${ref(element => {
                                            if (element instanceof HTMLInputElement) {
                                                displayValue(element, row.name);
                                            }
                                        })}
                                    />
                                    <div class="cells">
                                        ${repeat(
                                            view.columns.map(column => column.day),
                                            item => item,
                                            day =>
                                                html`<button
                                                    type="button"
                                                    class="cell"
                                                    data-cell=${ifDefined(id)}
                                                    data-day=${ifDefined(day)}
                                                    aria-pressed=${ifDefined(
                                                        row.cells[
                                                            view.columns.findIndex(
                                                                column => column.day === day,
                                                            )
                                                        ] === true,
                                                    )}
                                                    aria-label=${ifDefined(`${row.name}, ${day}`)}
                                                ></button>`,
                                        )}
                                    </div>
                                    <span
                                        class="streak"
                                        title=${ifDefined(`${row.streak} day streak`)}
                                        >${row.streak > 0 ? `${row.streak}🔥` : ''}</span
                                    ><button
                                        type="button"
                                        class="remove"
                                        data-remove=${ifDefined(id)}
                                        aria-label="delete habit; click twice"
                                    >
                                        ×
                                    </button>
                                </div>`,
                        ),
                )}
            </div>
        </div>
        <p class="ui-empty empty">No habits yet.</p>
        <form class="add">
            <input
                class="ui-field draft"
                type="text"
                placeholder="New habit"
                aria-label="new habit"
                autocomplete="off"
            /><button class="ui-button submit" type="submit">Add</button>
        </form>`;

type Arming = {
    readonly armed: string | null;
    readonly at: number;
    readonly fire: string | null;
};

const dataOf = (target: EventTarget | null, key: string): string | undefined => {
    const element = target instanceof Element ? target.closest(`[data-${key}]`) : null;

    return element instanceof HTMLElement ? element.dataset[key] : undefined;
};

export class HksHabits extends HTMLElement {
    readonly commands$: Observable<HabitCommand>;

    private readonly shadow: ShadowRoot;
    private readonly submitted$: Observable<string>;
    private readonly arming$: Observable<Arming>;

    private readonly rendering: RenderView<HabitsView>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<HabitsView>(shadow, { columns: [], rows: [] }, TEMPLATE);

        const grid = requireChild(shadow, '.grid');
        const form = requireElement(shadow, '.add', HTMLFormElement);
        const draft = requireElement(shadow, '.draft', HTMLInputElement);

        // One listener, shared: the draft is read once, before anyone clears it.
        this.submitted$ = fromElementEvent$(form, 'submit').pipe(
            // Not a page navigation: the form exists for Enter, not to be sent anywhere.
            tap(event => {
                event.preventDefault();
            }),
            map(() => draft.value),
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
        return merge(
            this.rendering.lifetime$,
            merge(
                view$.pipe(
                    tap(view => {
                        this.toggleAttribute('data-empty', view.rows.length === 0);
                        this.style.setProperty('--days', String(view.columns.length));
                        this.rendering.update(view);
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
            ).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-habits', HksHabits);
