import { html, nothing } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { merge, type Observable } from 'rxjs';
import { filter, map, mergeMap, tap } from 'rxjs/operators';
import { renderView, type RenderView } from '../../lib/lit.ts';
import { styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { readout, type KnobView, type PedalChange, type PedalView } from './pedal.ts';
import css from './pedal.css?inline';

const sheet = styleSheet(css);

const empty: PedalView = { summary: '', knobs: [], choices: [], choice: '', inputs: [] };

const knobRow = (knob: KnobView) =>
    html`<label class="row" data-driven=${ifDefined(knob.driven ? '' : undefined)}
        ><span class="key">${knob.name}</span
        ><input
            class="ui-range dial"
            type="range"
            data-knob=${knob.name}
            min=${knob.min}
            max=${knob.max}
            step=${knob.step}
            ?disabled=${knob.driven}
            .value=${String(knob.value)}
        /><output class="read"
            >${knob.driven ? 'follows' : readout(knob.value, knob.step)}</output
        ></label
    >`;

const TEMPLATE = (view: PedalView) =>
    html`<p class="summary">${view.summary}</p>
        <ul class="inputs">
            ${view.inputs.map(
                input =>
                    html`<li class="input">
                        ${input.name} · <b>${input.from ?? 'unplugged'}</b>
                    </li>`,
            )}
        </ul>
        ${
            view.choices.length === 0
                ? nothing
                : html`<div class="ui-choices choices" role="radiogroup" aria-label="choice">
                      ${view.choices.map(
                          choice =>
                              html`<label class="ui-segment"
                                  ><input
                                      type="radio"
                                      name="choice"
                                      .value=${choice}
                                      .checked=${choice === view.choice}
                                  /><span>${choice}</span></label
                              >`,
                      )}
                  </div>`
        }
        ${repeat(view.knobs, knob => knob.name, knobRow)}`;

export class HksPedal extends HTMLElement {
    readonly changes$: Observable<PedalChange>;

    private readonly rendering: RenderView<PedalView>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        const root = document.createElement('div');
        root.className = 'pedal';
        shadow.append(root);
        this.rendering = renderView(root, empty, TEMPLATE);

        this.changes$ = merge(
            fromElementEvent$(root, 'input').pipe(
                mergeMap(({ target }): PedalChange[] =>
                    target instanceof HTMLInputElement && target.type === 'range'
                        ? [
                              {
                                  kind: 'value',
                                  name: target.dataset['knob'] ?? '',
                                  value: target.valueAsNumber,
                              },
                          ]
                        : [],
                ),
            ),
            fromElementEvent$(root, 'change').pipe(
                mergeMap(({ target }): PedalChange[] =>
                    target instanceof HTMLInputElement && target.type === 'radio'
                        ? [{ kind: 'choice', choice: target.value }]
                        : [],
                ),
            ),
        ).pipe(filter(change => change.kind !== 'value' || change.name !== ''));
    }

    connect$(view$: Observable<PedalView>): Observable<void> {
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

customElements.define('hks-pedal', HksPedal);
