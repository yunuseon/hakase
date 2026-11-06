import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { withValue } from '../../lib/lit.ts';
import { ifDefined } from 'lit-html/directives/if-defined.js';

import { renderView, type RenderView } from '../../lib/lit.ts';
import { HksSelect, connectSelects$ } from '../../shared/select/select.component.ts';
import { EMPTY, merge, of, type Observable } from 'rxjs';
import { map, mergeMap, share, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import type { ClockCommand, ClockRow } from './clocks.ts';
import css from './clocks.css?inline';

const sheet = styleSheet(css);

type ClockRender = { readonly rows: readonly ClockRow[]; readonly choices: readonly string[] };
const TEMPLATE = (view: ClockRender) =>
    html`<ul class="rows">
            ${repeat(
                view.rows.map(row => row.zone),
                item => item,
                zone =>
                    withValue(
                        view.rows.find(row => row.zone === zone),
                        row =>
                            html`<li
                                class="row"
                                data-zone=${ifDefined(zone)}
                                data-night=${ifDefined(!row.daylight ? '' : undefined)}
                                title=${ifDefined(zone)}
                            >
                                <svg class="dial" viewBox="0 0 24 24">
                                    <circle class="face" cx="12" cy="12" r="10"></circle>
                                    <line
                                        class="hand"
                                        x1="12"
                                        y1="12"
                                        x2="12"
                                        y2="4.5"
                                        transform=${ifDefined(`rotate(${row.turn * 360} 12 12)`)}
                                    ></line>
                                </svg>
                                <div class="place">
                                    <span class="city">${row.city}</span
                                    ><span class="meta">${row.day} · ${row.difference}</span>
                                </div>
                                <div class="time">
                                    <span class="hm">${row.time}</span
                                    ><span class="s">${row.seconds}</span>
                                </div>
                                <button
                                    class="remove"
                                    type="button"
                                    data-remove=${ifDefined(zone)}
                                    aria-label=${ifDefined(`remove ${zone}`)}
                                >
                                    ×
                                </button>
                            </li>`,
                    ),
            )}
        </ul>
        <p class="empty" ?hidden=${view.rows.length > 0}>No clocks yet.</p>
        <form class="add">
            <hks-select
                editable=""
                class="draft"
                placeholder="Add a city or time zone"
                aria-label="time zone"
                >${repeat(
                    view.choices,
                    item => item,
                    zone => html`<option .value=${zone}>${zone.replaceAll('_', ' ')}</option>`,
                )}</hks-select
            ><button class="submit" type="submit">Add</button>
        </form>`;

export class HksClocks extends HTMLElement {
    readonly commands$: Observable<ClockCommand>;

    private readonly shadow: ShadowRoot;
    private readonly submitted$: Observable<string>;

    private readonly rendering: RenderView<ClockRender>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        this.rendering = renderView<ClockRender>(shadow, { rows: [], choices: [] }, TEMPLATE);

        const form = requireElement(shadow, '.add', HTMLFormElement);
        const draft = requireElement(shadow, '.draft', HksSelect);

        // One listener, shared: the draft is read once, before anyone clears it.
        this.submitted$ = fromElementEvent$(form, 'submit').pipe(
            // Not a page navigation: the form exists for Enter, not to be sent anywhere.
            tap(event => {
                event.preventDefault();
            }),
            map(() => draft.value),
            share(),
        );

        this.commands$ = merge(
            this.submitted$.pipe(map((zone): ClockCommand => ({ kind: 'add', zone }))),
            fromElementEvent$(requireChild(shadow, '.rows'), 'click').pipe(
                mergeMap(({ target }): Observable<ClockCommand> => {
                    const button =
                        target instanceof Element ? target.closest('[data-remove]') : null;
                    const zone =
                        button instanceof HTMLElement ? button.dataset['remove'] : undefined;

                    return zone === undefined ? EMPTY : of({ kind: 'remove', zone });
                }),
            ),
        );
    }

    connect$(rows$: Observable<readonly ClockRow[]>, choices: readonly string[]): Observable<void> {
        const shadow = this.shadow;
        const form = requireElement(shadow, '.add', HTMLFormElement);
        return merge(
            this.rendering.lifetime$,
            merge(
                connectSelects$(shadow),
                rows$.pipe(
                    tap(rows => {
                        this.toggleAttribute('data-empty', rows.length === 0);
                        this.rendering.update({ rows, choices });
                    }),
                ),
                this.submitted$.pipe(
                    tap(() => {
                        form.reset();
                        requireElement(shadow, '.draft', HksSelect).value = '';
                    }),
                ),
            ).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-clocks', HksClocks);
