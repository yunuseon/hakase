import { html } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { withValue } from '../../lib/lit.ts';

import { renderView, type RenderView } from '../../lib/lit.ts';
import { combineLatest, merge, type Observable } from 'rxjs';
import { map, mergeMap, share, startWith, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { choicesFor, nextChoiceIndex, selectionLabel, type PickerView } from './search-picker.ts';
import css from './search-picker.css?inline';

const sheet = styleSheet(css);

type PickerRender = {
    readonly view: PickerView;
    readonly query: string;
    readonly choices: ReturnType<typeof choicesFor>;
    readonly label: string;
};
export class HksSearchPicker extends HTMLElement {
    readonly picks$: Observable<string>;
    private readonly root: HTMLElement;
    private readonly query$: Observable<string>;

    private readonly rendering: RenderView<PickerRender>;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        this.rendering = renderView<PickerRender>(
            shadow,
            {
                view: { title: '', options: [], selected: [], multiple: false, create: false },
                query: '',
                choices: [],
                label: 'None',
            },
            state =>
                html`<div class="picker">
                    <details>
                        <summary>
                            <span class="title">${state.view.title}</span
                            ><span class="selection">${state.label}</span>
                        </summary>
                        <div class="panel">
                            <div class="search">
                                <input
                                    type="search"
                                    aria-label=${ifDefined(`search ${state.view.title.toLowerCase()}`)}
                                    .value=${state.query}
                                    placeholder="Search…"
                                    autocomplete="off"
                                /><button
                                    class="clear"
                                    type="button"
                                    data-pick=""
                                    aria-label="clear selection"
                                    title="Clear selection"
                                    ?hidden=${state.view.selected.length === 0 || state.view.multiple}
                                >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="m6 6 12 12M18 6 6 18"></path>
                                    </svg>
                                </button>
                            </div>
                            <div class="results">
                                ${repeat(
                                    state.choices.map(choice => choice.value),
                                    item => item,
                                    value =>
                                        withValue(
                                            state.choices.find(choice => choice.value === value),
                                            choice =>
                                                html`<button
                                                    type="button"
                                                    data-pick=${ifDefined(value)}
                                                    aria-pressed=${ifDefined(
                                                        state.view.selected.includes(value),
                                                    )}
                                                >
                                                    <span>${choice.label}</span
                                                    ><small>${choice.hint}</small>
                                                </button>`,
                                        ),
                                )}
                            </div>
                            <p class="empty" ?hidden=${state.choices.length > 0}>No matches</p>
                        </div>
                    </details>
                </div>`,
        );

        this.root = requireChild(shadow, '.picker');
        const input = requireElement(shadow, 'input', HTMLInputElement);
        this.picks$ = fromElementEvent$(this.root, 'click').pipe(
            mergeMap(({ target }) => {
                const picked = target instanceof Element ? target.closest('[data-pick]') : null;
                return picked instanceof HTMLElement && picked.dataset['pick'] !== undefined
                    ? [picked.dataset['pick']]
                    : [];
            }),
            share(),
        );
        this.query$ = fromElementEvent$(input, 'input').pipe(
            map(() => input.value),
            startWith(''),
        );
    }

    connect$(view$: Observable<PickerView>): Observable<void> {
        const root = this.root;
        const input = requireElement(root, 'input', HTMLInputElement);
        return merge(
            this.rendering.lifetime$,
            merge(
                fromElementEvent$(root, 'keydown').pipe(
                    mergeMap(event => {
                        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
                            return [];
                        }
                        const choices = [...root.querySelectorAll('.results button')].filter(
                            button => button instanceof HTMLButtonElement,
                        );
                        const current = choices.findIndex(button => button === event.target);
                        const target =
                            choices[
                                nextChoiceIndex(
                                    current,
                                    choices.length,
                                    event.key === 'ArrowDown' ? 1 : -1,
                                )
                            ];
                        return target === undefined ? [] : [{ event, target }];
                    }),
                    tap(({ event, target }) => {
                        event.preventDefault();
                        target.focus();
                    }),
                ),
                combineLatest([view$, this.query$]).pipe(
                    map(([view, query]) => ({
                        view,
                        query,
                        choices: choicesFor(view, query),
                        label: selectionLabel(view),
                    })),
                    tap(state => {
                        const active = this.shadowRoot?.activeElement;
                        const wasResult =
                            active instanceof HTMLButtonElement &&
                            active.closest('.results') !== null;
                        this.rendering.update(state);
                        if (wasResult && !active.isConnected) {
                            input.focus();
                        }
                    }),
                ),
                fromElementEvent$(root, 'keydown').pipe(
                    mergeMap(event =>
                        event.key === 'Escape' &&
                        requireElement(root, 'details', HTMLDetailsElement).open
                            ? [event]
                            : [],
                    ),
                    tap(event => {
                        event.preventDefault();
                        event.stopPropagation();
                        requireElement(root, 'details', HTMLDetailsElement).open = false;
                        requireChild(root, 'summary').focus();
                    }),
                ),
            ).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-search-picker', HksSearchPicker);
