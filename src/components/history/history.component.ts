import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { withValue } from '../../lib/lit.ts';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { when } from 'lit-html/directives/when.js';

import { renderView, type RenderView } from '../../lib/lit.ts';
import { EMPTY, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import css from './history.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = (entries: readonly HistoryEntry[]) =>
    html`<ol class="steps" aria-label="history">
            ${repeat(
                entries.map(entry => entry.id),
                item => item,
                id =>
                    withValue(
                        entries.find(entry => entry.id === id),
                        entry =>
                            html`<li data-taken=${ifDefined(entry.taken ? '' : undefined)}>
                                <button
                                    type="button"
                                    class="step"
                                    data-offset=${ifDefined(entry.offset)}
                                    aria-current=${ifDefined(entry.offset === 0 ? 'true' : undefined)}
                                    data-when=${ifDefined(
                                        entry.offset < 0
                                            ? 'past'
                                            : entry.offset > 0
                                              ? 'future'
                                              : 'now',
                                    )}
                                    title=${ifDefined(`${entry.offset === 0 ? 'where you are' : entry.offset < 0 ? `back ${-entry.offset}` : `forward ${entry.offset}`}${entry.taken ? ', taken back' : ''}`)}
                                >
                                    <span class="dot"></span
                                    ><span class="label">${entry.label}</span></button
                                >${when(
                                    id !== 0 &&
                                        entry.offset <= 0 &&
                                        !entry.taken &&
                                        !entry.takesBack,
                                    () =>
                                        html`<button
                                            type="button"
                                            class="take"
                                            data-take=${ifDefined(id)}
                                            title=${ifDefined(`take back “${entry.label}”, keeping everything done since`)}
                                            aria-label=${ifDefined(`take back ${entry.label}`)}
                                        >
                                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                                <path
                                                    d="M9 14 L4 9 L9 4 M4 9 H15 A5 5 0 0 1 15 19 H11"
                                                ></path>
                                            </svg>
                                        </button>`,
                                )}
                            </li>`,
                    ),
            )}
        </ol>
        <footer class="foot">
            <span class="summary"
                >${entries.filter(entry => entry.offset < 0).length} back
                ·${' '}${entries.filter(entry => entry.offset > 0).length} forward</span
            >
        </footer>`;

export type HistoryEntry = {
    readonly id: number;
    readonly label: string;
    // Steps from where you are: negative is back, positive is forward, 0 is now.
    readonly offset: number;
    readonly taken: boolean;
    readonly takesBack: boolean;
};

const keyOf = (entries: readonly HistoryEntry[]): string =>
    entries
        .map(({ id, label, offset, taken }) => `${id}:${offset}:${taken ? 'x' : ''}:${label}`)
        .join('\n');

export class HksHistory extends HTMLElement {
    readonly travels$: Observable<number>;
    readonly takeBacks$: Observable<number>;

    private readonly shadow: ShadowRoot;

    private readonly rendering: RenderView<readonly HistoryEntry[]>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        this.rendering = renderView<readonly HistoryEntry[]>(shadow, [], TEMPLATE);

        this.takeBacks$ = fromElementEvent$(requireChild(shadow, '.steps'), 'click').pipe(
            mergeMap(({ target }) => {
                const take = target instanceof Element ? target.closest('[data-take]') : null;
                const id = take instanceof HTMLElement ? Number(take.dataset['take']) : NaN;

                return Number.isFinite(id) ? of(id) : EMPTY;
            }),
        );

        this.travels$ = fromElementEvent$(requireChild(shadow, '.steps'), 'click').pipe(
            mergeMap(({ target }) => {
                const step = target instanceof Element ? target.closest('[data-offset]') : null;
                const offset = step instanceof HTMLElement ? Number(step.dataset['offset']) : 0;

                return offset === 0 || !Number.isFinite(offset) ? EMPTY : of(offset);
            }),
        );
    }

    connect$(entries$: Observable<readonly HistoryEntry[]>): Observable<void> {
        const steps = requireChild(this.shadow, '.steps');

        return merge(
            this.rendering.lifetime$,
            merge(
                entries$.pipe(
                    distinctUntilChanged((a, b) => keyOf(a) === keyOf(b)),
                    tap(entries => {
                        this.rendering.update(entries);

                        steps
                            .querySelector('[aria-current="true"]')
                            ?.scrollIntoView({ block: 'nearest' });
                    }),
                ),
            ).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-history', HksHistory);
