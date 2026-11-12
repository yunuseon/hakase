import { html, nothing } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';
import { merge, type Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { displayValue, renderView, type RenderView } from '../../lib/lit.ts';
import { styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import type { BoxChange, BoxView, PinView } from './box.ts';
import css from './box.css?inline';

const sheet = styleSheet(css);

const empty: BoxView = { name: '', tick: 0, inputs: [], outputs: [] };

const pin = (view: PinView, tick: number, side: 'in' | 'out') => {
    const bit = html`<span
        class="bit"
        role="img"
        aria-label=${view.bit === 1 ? 'on' : 'off'}
        ?data-on=${view.bit === 1}
    ></span>`;
    const label = html`<span class="label" title=${view.name}>${view.name}</span>`;

    return html`<div class="pin">
        ${side === 'in' ? [bit, label] : [label, bit]}
        ${
            view.row.length < 2
                ? nothing
                : html`<div class="row" aria-hidden="true">
                      ${view.row.map(
                          (on, at) =>
                              html`<span ?data-on=${on === 1} ?data-now=${at === tick}></span>`,
                      )}
                  </div>`
        }
    </div>`;
};

const side = (title: string, pins: readonly PinView[], tick: number, which: 'in' | 'out') =>
    html`<section class="side" data-side=${which} aria-label=${title}>
        <h3>${title}</h3>
        ${
            pins.length === 0
                ? html`<p class="empty">none</p>`
                : pins.map(view => pin(view, tick, which))
        }
    </section>`;

const TEMPLATE = (view: BoxView) =>
    html`<div class="head">
            <input
                class="ui-field name"
                type="text"
                aria-label="component name"
                ${ref(element => {
                    if (element instanceof HTMLInputElement) {
                        displayValue(element, view.name);
                    }
                })}
            />
            <button
                class="ui-button"
                type="button"
                data-open
                title="Open the component into its gates (undoable)"
            >
                Open
            </button>
        </div>
        <div class="pins">
            ${side('Inputs', view.inputs, view.tick, 'in')}
            ${side('Outputs', view.outputs, view.tick, 'out')}
        </div>`;

export class HksBox extends HTMLElement {
    readonly changes$: Observable<BoxChange>;

    private readonly rendering: RenderView<BoxView>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        const root = document.createElement('div');
        root.className = 'box';
        shadow.append(root);
        this.rendering = renderView(root, empty, TEMPLATE);

        this.changes$ = merge(
            fromElementEvent$(root, 'click').pipe(
                mergeMap(({ target }): BoxChange[] =>
                    target instanceof Element && target.closest('[data-open]') !== null
                        ? [{ kind: 'open' }]
                        : [],
                ),
            ),
            fromElementEvent$(root, 'change').pipe(
                mergeMap(({ target }): BoxChange[] =>
                    target instanceof HTMLInputElement
                        ? [{ kind: 'rename', name: target.value }]
                        : [],
                ),
            ),
        );
    }

    connect$(view$: Observable<BoxView>): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            view$.pipe(
                tap(view => {
                    this.rendering.update(view);
                }),
                map(() => undefined),
            ),
        );
    }
}

customElements.define('hks-box', HksBox);
