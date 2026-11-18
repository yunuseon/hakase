import { html, svg } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { when } from 'lit-html/directives/when.js';
import { merge, type Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { styleSheet } from '../../lib/dom.ts';
import { renderView, type RenderView } from '../../lib/lit.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { HEIGHT, WIDTH, type ConverterView } from './converter.ts';
import css from './converter.css?inline';

const sheet = styleSheet(css);
const PAD = 4;

const empty: ConverterView = {
    summary: '',
    path: '',
    x: 0,
    y: HEIGHT,
    value: '–',
    top: '1',
    bottom: '0',
    zero: HEIGHT,
    empty: null,
};

const TEMPLATE = (view: ConverterView) =>
    html`<div data-stage>
            <div class="head">
                <p class="summary" data-detail>${view.summary}</p>
                <output class="value" aria-label="level now" ?hidden=${view.empty !== null}
                    >${view.value}</output
                >
            </div>
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
        </div>
        <slot name="controls" data-detail></slot>`;

export class HksConverter extends HTMLElement {
    private readonly rendering: RenderView<ConverterView>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        const root = document.createElement('div');
        root.className = 'converter ui-staged';
        shadow.append(root);
        this.rendering = renderView(root, empty, TEMPLATE);
    }

    connect$(view$: Observable<ConverterView>): Observable<void> {
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

customElements.define('hks-converter', HksConverter);
