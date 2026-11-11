import { html, nothing } from 'lit-html';
import { ref } from 'lit-html/directives/ref.js';
import { merge, type Observable } from 'rxjs';
import { filter, map, mergeMap, tap } from 'rxjs/operators';
import { displayValue, renderView, type RenderView } from '../../lib/lit.ts';
import { styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import type { GateChange, GateView } from './gate.ts';
import css from './gate.css?inline';

const sheet = styleSheet(css);

const empty: GateView = {
    icon: '',
    summary: '',
    bit: 0,
    tick: 0,
    row: [],
    toggle: false,
    steps: null,
    threshold: null,
    name: null,
};

const TEMPLATE = (view: GateView) =>
    html`<div class="face">
            <svg class="glyph" viewBox="0 0 24 24" aria-hidden="true">
                <path d=${view.icon}></path>
            </svg>
            <span
                class="bit"
                role="img"
                aria-label=${view.bit === 1 ? 'on' : 'off'}
                ?data-on=${view.bit === 1}
            ></span>
            ${
                view.toggle
                    ? html`<button class="ui-button toggle" type="button" data-toggle>
                          ${view.bit === 1 ? 'turn off' : 'turn on'}
                      </button>`
                    : nothing
            }
        </div>
        <div class="row" aria-hidden="true">
            ${view.row.map(
                (bit, tick) =>
                    html`<span ?data-on=${bit === 1} ?data-now=${tick === view.tick}></span>`,
            )}
        </div>
        ${
            view.steps === null
                ? nothing
                : html`<div class="steps" role="group" aria-label="steps">
                      ${view.steps.map(
                          (bit, index) =>
                              html`<button
                                  type="button"
                                  data-step=${index}
                                  aria-pressed=${bit === 1 ? 'true' : 'false'}
                                  aria-label=${`step ${index + 1}`}
                              ></button>`,
                      )}
                  </div>`
        }
        ${
            view.threshold === null
                ? nothing
                : html`<label
                      >threshold
                      <input
                          class="ui-range threshold"
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          .value=${String(view.threshold)}
                  /></label>`
        }
        ${
            view.name === null
                ? nothing
                : html`<input
                      class="ui-field name"
                      type="text"
                      aria-label="pin name"
                      ${ref(element => {
                          if (element instanceof HTMLInputElement) {
                              displayValue(element, view.name ?? '');
                          }
                      })}
                  />`
        }
        <p class="summary">${view.summary}</p>`;

export class HksGate extends HTMLElement {
    readonly changes$: Observable<GateChange>;

    private readonly rendering: RenderView<GateView>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        const root = document.createElement('div');
        root.className = 'gate';
        shadow.append(root);
        this.rendering = renderView(root, empty, TEMPLATE);

        this.changes$ = merge(
            fromElementEvent$(root, 'click').pipe(
                mergeMap(({ target }): GateChange[] => {
                    const button = target instanceof Element ? target.closest('button') : null;

                    if (button === null) {
                        return [];
                    }

                    if (button.hasAttribute('data-toggle')) {
                        return [{ kind: 'toggle' }];
                    }

                    const index = Number(button.dataset['step']);

                    return Number.isInteger(index)
                        ? [
                              {
                                  kind: 'step',
                                  index,
                                  value: button.getAttribute('aria-pressed') === 'true' ? 0 : 1,
                              },
                          ]
                        : [];
                }),
            ),
            fromElementEvent$(root, 'input').pipe(
                mergeMap(({ target }): GateChange[] =>
                    target instanceof HTMLInputElement && target.type === 'range'
                        ? [{ kind: 'threshold', threshold: target.valueAsNumber }]
                        : [],
                ),
            ),
            fromElementEvent$(root, 'change').pipe(
                mergeMap(({ target }): GateChange[] =>
                    target instanceof HTMLInputElement && target.type === 'text'
                        ? [{ kind: 'rename', name: target.value }]
                        : [],
                ),
            ),
        ).pipe(filter(change => change.kind !== 'threshold' || Number.isFinite(change.threshold)));
    }

    connect$(view$: Observable<GateView>): Observable<void> {
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

customElements.define('hks-gate', HksGate);
