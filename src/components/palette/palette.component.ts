import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { ifDefined } from 'lit-html/directives/if-defined.js';

import { renderView, type RenderView } from '../../lib/lit.ts';
import { combineLatest, EMPTY, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, filter, map, mergeMap, share, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import { matched, sameCommands, type Command, type Match } from './palette.ts';
import css from './palette.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = (matches: readonly Match[]) =>
    html`<div class="scrim"></div>
        <div class="panel" role="dialog" aria-label="command palette">
            <input
                class="ui-field query"
                type="text"
                placeholder="Type a command"
                aria-label="command"
                autocomplete="off"
                spellcheck="false"
                role="combobox"
                aria-expanded="true"
                aria-controls="results"
            />
            <ul class="results" id="results" role="listbox">
                ${repeat(
                    matches,
                    (_item, index) => index,
                    (match, index) =>
                        html`<li
                            class="row"
                            id=${ifDefined(`command-${index}`)}
                            data-command=${ifDefined(match.command.id)}
                            data-keyword=${ifDefined(match.command.keyword ?? undefined)}
                            data-text=${ifDefined(match.text ?? undefined)}
                            role="option"
                        >
                            <span class="label"
                                >${
                                    match.text === null
                                        ? match.command.label
                                        : `${match.command.label}: ${match.text}`
                                }</span
                            ><span class="hint">${match.command.hint}</span>
                        </li>`,
                )}
            </ul>
            <p class="ui-empty empty">No command matches.</p>
        </div>`;

export type Pick = { readonly id: string; readonly text: string | null };

export class HksPalette extends HTMLElement {
    readonly opens$: Observable<void>;
    readonly closes$: Observable<void>;
    readonly picks$: Observable<Pick>;

    private readonly query: HTMLInputElement;
    private readonly chosen$: Observable<HTMLElement>;
    private readonly results: HTMLElement;

    private readonly rendering: RenderView<readonly Match[]>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<readonly Match[]>(shadow, [], TEMPLATE);

        this.query = requireElement(shadow, '.query', HTMLInputElement);
        this.results = requireChild(shadow, '.results');

        // Anywhere, even inside a text field: ⌘K is the palette's own, and no field uses it.
        this.opens$ = fromDocumentEvent$('keydown').pipe(
            filter(event => (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'),
            tap(event => {
                event.preventDefault();
            }),
            map(() => undefined),
        );

        this.closes$ = merge(
            fromElementEvent$(requireChild(shadow, '.scrim'), 'click'),
            fromElementEvent$(this.query, 'keydown').pipe(filter(({ key }) => key === 'Escape')),
        ).pipe(map(() => undefined));

        // One shared listener: the pick and the fill-in read the same row, never two reads of the DOM.
        this.chosen$ = merge(
            fromElementEvent$(this.results, 'click').pipe(
                mergeMap(({ target }) => {
                    const row = target instanceof Element ? target.closest('[data-command]') : null;

                    return row instanceof HTMLElement ? of(row) : EMPTY;
                }),
            ),
            fromElementEvent$(this.query, 'keydown').pipe(
                filter(({ key }) => key === 'Enter'),
                mergeMap(() => {
                    const row = this.active();

                    return row === undefined ? EMPTY : of(row);
                }),
            ),
        ).pipe(share());

        this.picks$ = this.chosen$.pipe(
            mergeMap(({ dataset }): Pick[] => {
                const id = dataset['command'];
                const text = dataset['text'] ?? null;

                return id === undefined || (dataset['keyword'] !== undefined && text === null)
                    ? []
                    : [{ id, text }];
            }),
        );
    }

    private rows(): HTMLElement[] {
        return [...this.results.children].filter(row => row instanceof HTMLElement);
    }

    private active(): HTMLElement | undefined {
        return this.rows().find(row => row.hasAttribute('data-active'));
    }

    private activate(row: HTMLElement | undefined): void {
        for (const each of this.rows()) {
            each.toggleAttribute('data-active', each === row);
        }

        if (row === undefined) {
            this.query.removeAttribute('aria-activedescendant');

            return;
        }

        this.query.setAttribute('aria-activedescendant', row.id);
        row.scrollIntoView({ block: 'nearest' });
    }

    // The query and the highlighted row are this view's own: what is typed is not app state.
    connect$(
        commands$: Observable<readonly Command[]>,
        open$: Observable<boolean>,
    ): Observable<void> {
        const shown$ = open$.pipe(
            distinctUntilChanged(),
            tap(open => {
                this.toggleAttribute('data-open', open);

                if (open) {
                    this.query.value = '';
                    this.query.focus();
                } else {
                    this.query.blur();
                }
            }),
        );

        const filled$ = this.chosen$.pipe(
            mergeMap(({ dataset }) =>
                dataset['keyword'] !== undefined && dataset['text'] === undefined
                    ? [`${dataset['keyword']} `]
                    : [],
            ),
            tap(text => {
                this.query.value = text;
                this.query.focus();
            }),
        );

        // Read from the field on every keystroke, on opening after shown$ has emptied it, and after a fill-in.
        const query$ = merge(fromElementEvent$(this.query, 'input'), open$, filled$).pipe(
            map(() => this.query.value),
        );

        const filtered$ = combineLatest([
            commands$.pipe(distinctUntilChanged(sameCommands)),
            query$,
        ]).pipe(
            map(([commands, query]) => matched(commands, query)),
            tap(shown => {
                this.rendering.update(shown);
                this.activate(this.rows()[0]);
            }),
        );

        const moved$ = fromElementEvent$(this.query, 'keydown').pipe(
            filter(({ key }) => key === 'ArrowDown' || key === 'ArrowUp'),
            tap(event => {
                event.preventDefault();
                const rows = this.rows();
                const index = rows.findIndex(row => row.hasAttribute('data-active'));
                const step = event.key === 'ArrowDown' ? 1 : -1;
                this.activate(rows[(index + step + rows.length) % Math.max(rows.length, 1)]);
            }),
        );

        return merge(
            this.rendering.lifetime$,
            merge(shown$, filtered$, moved$).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-palette', HksPalette);
