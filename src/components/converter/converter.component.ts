import { html, svg } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { ref } from 'lit-html/directives/ref.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { when } from 'lit-html/directives/when.js';
import { merge, type Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { styleSheet } from '../../lib/dom.ts';
import { displayValue, renderView, type RenderView } from '../../lib/lit.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { connectChoices$ } from '../../shared/ui/choices.component.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { HEIGHT, WIDTH, type ConverterView, type ShapeView } from './converter.ts';
import css from './converter.css?inline';

const sheet = styleSheet(css);
const PAD = 4;

const empty: ConverterView = {
    summary: '',
    choices: [],
    path: '',
    x: 0,
    y: HEIGHT,
    value: '–',
    top: '1',
    bottom: '0',
    zero: HEIGHT,
    empty: null,
    shape: null,
};

export type ShapeChange = { readonly field: string; readonly value: number };

const bound = (field: 'low' | 'high', value: number, label: string) =>
    html`<input
        class="ui-field bound"
        type="number"
        step="0.1"
        data-shape=${field}
        aria-label=${label}
        ${ref(element => {
            if (element instanceof HTMLInputElement) {
                displayValue(element, String(value));
            }
        })}
    />`;

const slider = (
    field: string,
    label: string,
    value: number,
    text: string,
    { min, max, step }: { readonly min: number; readonly max: number; readonly step: number },
) =>
    html`<label class="row">
        <span class="key">${label}</span>
        <input
            class="ui-range"
            type="range"
            min=${min}
            max=${max}
            step=${step}
            data-shape=${field}
            .value=${String(value)}
        />
        <output>${text}</output>
    </label>`;

const Shape = (shape: ShapeView) =>
    html`<div class="shape" role="group" aria-label="shape">
        <div class="row">
            <span class="key">range</span>
            <span class="bounds">
                ${bound('low', shape.low, 'lowest value')}<span>to</span>${bound(
                    'high',
                    shape.high,
                    'highest value',
                )}
            </span>
        </div>
        <label class="row">
            <span class="key">invert</span>
            <input class="ui-check" type="checkbox" data-shape="invert" .checked=${shape.invert} />
        </label>
        ${slider('curve', 'curve', shape.curve, shape.curveText, { min: -1, max: 1, step: 0.05 })}
        ${slider('steps', 'steps', shape.steps, shape.stepsText, { min: 0, max: 16, step: 1 })}
        ${slider('smooth', 'smooth', shape.smooth, shape.smoothText, {
            min: 0,
            max: 0.99,
            step: 0.01,
        })}
    </div>`;

const TEMPLATE = (view: ConverterView) =>
    html`<p class="summary">${view.summary}</p>
        <div class="scope">
            <svg
                viewBox=${ifDefined(`0 ${-PAD} ${WIDTH} ${HEIGHT + 2 * PAD}`)}
                preserveAspectRatio="none"
                aria-hidden="true"
            >
                ${svg`<line class="base" x2=${ifDefined(WIDTH)} y1=${ifDefined(view.zero)} y2=${ifDefined(view.zero)}></line>
                <path class="curve" d=${ifDefined(view.path)}></path>
                <line class="now" x1=${ifDefined(view.x)} x2=${ifDefined(view.x)} y1=${ifDefined(-PAD)} y2=${ifDefined(HEIGHT + PAD)}></line>`}
            </svg>
            <span class="top" ?hidden=${view.empty !== null}>${view.top}</span>
            <span class="bottom" ?hidden=${view.empty !== null}>${view.bottom}</span>
            <span
                class="dot"
                ?hidden=${view.empty !== null}
                style=${styleMap({
                    '--x': String(view.x / WIDTH),
                    '--y': String((view.y + PAD) / (HEIGHT + 2 * PAD)),
                })}
            ></span>
            ${when(view.empty !== null, () => html`<p class="empty">${view.empty}</p>`)}
        </div>
        <div class="foot">
            <div class="ui-choices" role="radiogroup" aria-label="reading">
                ${view.choices.map(
                    choice =>
                        html`<button
                            class="ui-choice"
                            type="button"
                            role="radio"
                            data-choice=${ifDefined(choice.id)}
                            aria-checked=${ifDefined(String(choice.checked))}
                        >
                            ${choice.title}
                        </button>`,
                )}
            </div>
            <output class="value" aria-label="level now">${view.value}</output>
        </div>
        ${view.shape === null ? null : Shape(view.shape)}`;

const shapeOf = (target: EventTarget | null): ShapeChange[] => {
    if (!(target instanceof HTMLInputElement)) {
        return [];
    }

    const field = target.dataset['shape'];
    const value = target.type === 'checkbox' ? Number(target.checked) : target.valueAsNumber;

    return field === undefined || !Number.isFinite(value) ? [] : [{ field, value }];
};

export class HksConverter extends HTMLElement {
    readonly choices$: Observable<string>;
    readonly shapes$: Observable<ShapeChange>;

    private readonly shadow: ShadowRoot;
    private readonly rendering: RenderView<ConverterView>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        const root = document.createElement('div');
        root.className = 'converter';
        shadow.append(root);
        this.rendering = renderView(root, empty, TEMPLATE);

        this.choices$ = fromElementEvent$(root, 'click').pipe(
            mergeMap(({ target }) => {
                const choice =
                    target instanceof Element
                        ? target.closest('[data-choice]')?.getAttribute('data-choice')
                        : null;

                return typeof choice === 'string' ? [choice] : [];
            }),
        );

        this.shapes$ = merge(
            fromElementEvent$(root, 'input').pipe(
                mergeMap(({ target }) =>
                    target instanceof HTMLInputElement && target.type === 'range'
                        ? shapeOf(target)
                        : [],
                ),
            ),
            fromElementEvent$(root, 'change').pipe(
                mergeMap(({ target }) =>
                    target instanceof HTMLInputElement && target.type !== 'range'
                        ? shapeOf(target)
                        : [],
                ),
            ),
        );
    }

    connect$(view$: Observable<ConverterView>): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            connectChoices$(this.shadow),
            view$.pipe(
                tap(view => {
                    this.rendering.update(view);
                }),
                map(() => undefined),
            ),
        );
    }
}

customElements.define('hks-converter', HksConverter);
