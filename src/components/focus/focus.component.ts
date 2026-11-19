import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { mountView, type Rendering } from '../../lib/lit.ts';
import { merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { ROUNDS, type FocusCommand, type FocusView } from '../../model/focus.ts';
import css from './focus.css?inline';

const sheet = styleSheet(css);

const RADIUS = 46;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const TEMPLATE = () =>
    html`<div class="ui-staged">
        <div data-stage>
            <div class="dial">
                <svg viewBox="0 0 100 100" aria-hidden="true">
                    <circle class="track" cx="50" cy="50" r=${ifDefined(RADIUS)}></circle>
                    <circle
                        class="arc"
                        cx="50"
                        cy="50"
                        r=${ifDefined(RADIUS)}
                        stroke-dasharray=${ifDefined(String(CIRCUMFERENCE))}
                    ></circle>
                </svg>
                <div class="readout">
                    <span class="label"></span><span class="clock" role="timer"></span
                    ><span class="rounds"></span>
                </div>
            </div>
            <div class="controls">
                <button
                    class="ui-button reset"
                    type="button"
                    aria-label="reset"
                    title="back to the first session"
                >
                    ↺</button
                ><button class="toggle" type="button"></button
                ><button
                    class="ui-icon skip"
                    type="button"
                    aria-label="skip"
                    title="skip to the next phase"
                >
                    ⏭
                </button>
            </div>
        </div>
        <slot name="controls" data-detail></slot>
    </div>`;

export class HksFocus extends HTMLElement {
    readonly commands$: Observable<FocusCommand>;

    private readonly shadow: ShadowRoot;

    private readonly rendering: Rendering;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());

        this.commands$ = merge(
            fromElementEvent$(requireChild(shadow, '.toggle'), 'click').pipe(
                map((): FocusCommand => ({ kind: 'toggle' })),
            ),
            fromElementEvent$(requireChild(shadow, '.reset'), 'click').pipe(
                map((): FocusCommand => ({ kind: 'reset' })),
            ),
            fromElementEvent$(requireChild(shadow, '.skip'), 'click').pipe(
                map((): FocusCommand => ({ kind: 'skip' })),
            ),
        );
    }

    connect$(view$: Observable<FocusView>): Observable<void> {
        const shadow = this.shadow;
        const arc = requireElement(shadow, '.arc', SVGCircleElement);
        const label = requireChild(shadow, '.label');
        const clock = requireChild(shadow, '.clock');
        const rounds = requireChild(shadow, '.rounds');
        const toggle = requireElement(shadow, '.toggle', HTMLButtonElement);
        const buttons = [
            toggle,
            requireElement(shadow, '.reset', HTMLButtonElement),
            requireElement(shadow, '.skip', HTMLButtonElement),
        ];

        return merge(
            this.rendering.lifetime$,
            merge(
                view$.pipe(
                    map(({ progress }) => String(CIRCUMFERENCE * (1 - progress))),
                    distinctUntilChanged(),
                    tap(offset => {
                        arc.setAttribute('stroke-dashoffset', offset);
                    }),
                ),
                view$.pipe(
                    map(({ clock: text }) => text),
                    distinctUntilChanged(),
                    tap(text => {
                        clock.textContent = text;
                    }),
                ),
                view$.pipe(
                    distinctUntilChanged(
                        (a, b) =>
                            a.phase === b.phase &&
                            a.label === b.label &&
                            a.round === b.round &&
                            a.running === b.running &&
                            a.planned === b.planned,
                    ),
                    tap(({ phase, label: text, round, running, planned }) => {
                        this.dataset['phase'] = phase;
                        this.toggleAttribute('data-planned', planned);
                        label.textContent = text;
                        rounds.textContent = planned
                            ? 'from the agenda'
                            : Array.from({ length: ROUNDS }, (_, index) =>
                                  index < round ? '●' : '○',
                              ).join(' ');
                        toggle.textContent = planned ? 'Planned' : running ? 'Pause' : 'Start';
                        toggle.toggleAttribute('data-running', running);
                        buttons.forEach(button => {
                            button.disabled = planned;
                        });
                    }),
                ),
            ).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-focus', HksFocus);
