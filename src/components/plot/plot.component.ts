import { svg, html } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { when } from 'lit-html/directives/when.js';
import { styleMap } from 'lit-html/directives/style-map.js';

import { renderView, type RenderView } from '../../lib/lit.ts';
import { combineLatest, merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, share, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { pointerGesture$, type Phase } from '../../shared/drag.ts';
import {
    atOf,
    boundsOf,
    HEIGHT,
    isLayout,
    lanesOf,
    LAYOUTS,
    readingsAt,
    valueText,
    WIDTH,
    type Layout,
    type Trace,
} from './plot.ts';
import css from './plot.css?inline';

const sheet = styleSheet(css);
type PlotRender = { readonly lanes: ReturnType<typeof lanesOf>; readonly layout: Layout };
const PAD = 4;

const TEMPLATE = (view: PlotRender) =>
    html`<div class="plot" title="drag to scrub">
            <svg
                viewBox=${ifDefined(`0 ${-PAD} ${WIDTH} ${HEIGHT + 2 * PAD}`)}
                preserveAspectRatio="none"
                aria-hidden="true"
            >
                <g class="zeros">
                    ${repeat(
                        view.lanes,
                        (_item, index) => index,
                        lane =>
                            when(
                                lane.zero !== null,
                                () =>
                                    svg`<line x2=${ifDefined(WIDTH)} y1=${ifDefined(lane.zero ?? 0)} y2=${ifDefined(lane.zero ?? 0)}></line>`,
                            ),
                    )}
                </g>
                <g class="lines">
                    ${repeat(
                        view.lanes,
                        (_item, index) => index,
                        lane =>
                            svg`<path d=${ifDefined(lane.path)} style=${styleMap({ '--trace': lane.colour })}></path>`,
                    )}
                </g>
                <line class="now" y1=${ifDefined(-PAD)} y2=${ifDefined(HEIGHT + PAD)}></line>
            </svg>
            <div class="bounds">
                ${repeat(
                    boundsOf(view.lanes, view.layout),
                    (_item, index) => index,
                    bound =>
                        html`<span
                            class="bound"
                            data-low=${ifDefined(bound.low ? '' : undefined)}
                            style=${styleMap({ '--y': String(along(bound.y)) })}
                            >${bound.text}</span
                        >`,
                )}
            </div>
            <div class="dots">
                ${repeat(
                    view.lanes,
                    (_item, index) => index,
                    lane =>
                        html`<span
                            class="dot"
                            data-key=${ifDefined(lane.key)}
                            style=${styleMap({ '--trace': lane.colour })}
                        ></span>`,
                )}
            </div>
            <p class="empty">
                <span
                    >Plug signals into <b>a</b> to <b>d</b>: drag wires in state mode (hold W), or
                    pick them in this window's state menu.</span
                >
            </p>
        </div>
        <div class="foot">
            <ul class="legend" aria-label="signals">
                ${repeat(
                    view.lanes,
                    (_item, index) => index,
                    lane =>
                        html`<li
                            data-key=${ifDefined(lane.key)}
                            style=${styleMap({ '--trace': lane.colour })}
                        >
                            <span class="name">${lane.label}</span><span class="value"></span>
                        </li>`,
                )}
            </ul>
            <div class="layouts" role="radiogroup" aria-label="layout">
                ${LAYOUTS.map(
                    layout =>
                        html`<button type="button" role="radio" data-layout=${ifDefined(layout)}>
                            ${layout}
                        </button>`,
                )}
            </div>
        </div>`;

const along = (y: number) => (y + PAD) / (HEIGHT + 2 * PAD);

export type Scrub = { readonly phase: Phase; readonly at: number };

export class HksPlot extends HTMLElement {
    readonly layouts$: Observable<Layout>;
    readonly scrubs$: Observable<Scrub>;

    private readonly shadow: ShadowRoot;

    private readonly rendering: RenderView<PlotRender>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        this.rendering = renderView<PlotRender>(shadow, { lanes: [], layout: 'overlay' }, TEMPLATE);

        const plot = requireChild(shadow, '.plot');
        const svg = requireElement(shadow, 'svg', SVGSVGElement);

        this.layouts$ = fromElementEvent$(requireChild(shadow, '.layouts'), 'click').pipe(
            mergeMap(({ target }) => {
                const layout = target instanceof HTMLElement ? target.dataset['layout'] : undefined;

                return layout !== undefined && isLayout(layout) ? [layout] : [];
            }),
        );

        this.scrubs$ = pointerGesture$(plot).pipe(
            map(({ phase, event }) => {
                const rect = svg.getBoundingClientRect();

                return { phase, at: atOf(event.clientX - rect.left, rect.width) };
            }),
            share(),
        );
    }

    connect$(
        traces$: Observable<readonly Trace[]>,
        layout$: Observable<Layout>,
        t$: Observable<number>,
    ): Observable<void> {
        const shadow = this.shadow;
        const now = requireElement(shadow, '.now', SVGLineElement);
        const dots = requireChild(shadow, '.dots');
        const legend = requireChild(shadow, '.legend');
        const empty = requireChild(shadow, '.empty');

        const plotted$ = combineLatest([traces$, layout$]).pipe(
            map(([traces, layout]) => ({ traces, layout, lanes: lanesOf(traces, layout) })),
            tap(({ traces, layout, lanes }) => {
                empty.hidden = traces.length > 0;

                this.rendering.update({ lanes, layout });
            }),
            share(),
        );

        const moment$ = combineLatest([plotted$, t$]).pipe(
            tap(([{ traces, lanes }, t]) => {
                now.setAttribute('x1', String(t * WIDTH));
                now.setAttribute('x2', String(t * WIDTH));

                for (const { key, value, x, y } of readingsAt(traces, lanes, t)) {
                    const dot = dots.querySelector(`[data-key="${key}"]`);
                    const reading = legend.querySelector(`[data-key="${key}"] .value`);

                    if (dot instanceof HTMLElement) {
                        dot.style.setProperty('--x', String(x / WIDTH));
                        dot.style.setProperty('--y', String(along(y)));
                    }

                    if (reading !== null) {
                        reading.textContent = valueText(value);
                    }
                }
            }),
        );

        const chosen$ = layout$.pipe(
            distinctUntilChanged(),
            tap(layout => {
                for (const button of shadow.querySelectorAll('[data-layout]')) {
                    if (button instanceof HTMLElement) {
                        button.setAttribute(
                            'aria-checked',
                            String(button.dataset['layout'] === layout),
                        );
                    }
                }
            }),
        );

        return merge(
            this.rendering.lifetime$,
            merge(plotted$, moment$, chosen$).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-plot', HksPlot);
