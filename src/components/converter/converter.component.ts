import { html, svg } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { when } from 'lit-html/directives/when.js';
import { merge, type Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { styleSheet } from '../../lib/dom.ts';
import { renderView, type RenderView } from '../../lib/lit.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { connectChoices$ } from '../../shared/ui/choices.component.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { HEIGHT, WIDTH, type ConverterView } from './converter.ts';
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
    empty: null,
};

const TEMPLATE = (view: ConverterView) =>
    html`<p class="summary">${view.summary}</p>
        <div class="scope">
            <svg
                viewBox=${ifDefined(`0 ${-PAD} ${WIDTH} ${HEIGHT + 2 * PAD}`)}
                preserveAspectRatio="none"
                aria-hidden="true"
            >
                ${svg`<line class="base" x2=${ifDefined(WIDTH)} y1=${ifDefined(HEIGHT)} y2=${ifDefined(HEIGHT)}></line>
                <path class="curve" d=${ifDefined(view.path)}></path>
                <line class="now" x1=${ifDefined(view.x)} x2=${ifDefined(view.x)} y1=${ifDefined(-PAD)} y2=${ifDefined(HEIGHT + PAD)}></line>`}
            </svg>
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
        </div>`;

export class HksConverter extends HTMLElement {
    readonly choices$: Observable<string>;

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
