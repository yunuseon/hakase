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
const SVG = 'http://www.w3.org/2000/svg';
const PAD = 4;

const TEMPLATE = `
    <div class="plot" title="drag to scrub">
        <svg viewBox="0 ${-PAD} ${WIDTH} ${HEIGHT + 2 * PAD}" preserveAspectRatio="none" aria-hidden="true">
            <g class="zeros"></g>
            <g class="lines"></g>
            <line class="now" y1="${-PAD}" y2="${HEIGHT + PAD}" />
        </svg>
        <div class="bounds"></div>
        <div class="dots"></div>
        <p class="empty"><span>Plug signals into <b>a</b> to <b>d</b>: drag wires in state mode (hold W), or pick them in this window's state menu.</span></p>
    </div>
    <div class="foot">
        <ul class="legend" aria-label="signals"></ul>
        <div class="layouts" role="radiogroup" aria-label="layout">
            ${LAYOUTS.map(
                layout =>
                    `<button type="button" role="radio" data-layout="${layout}">${layout}</button>`,
            ).join('')}
        </div>
    </div>
`;

const along = (y: number) => (y + PAD) / (HEIGHT + 2 * PAD);

export type Scrub = { readonly phase: Phase; readonly at: number };

export class HksPlot extends HTMLElement {
    readonly layouts$: Observable<Layout>;
    readonly scrubs$: Observable<Scrub>;

    private readonly shadow: ShadowRoot;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

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
        const lines = requireElement(shadow, '.lines', SVGGElement);
        const zeros = requireElement(shadow, '.zeros', SVGGElement);
        const now = requireElement(shadow, '.now', SVGLineElement);
        const bounds = requireChild(shadow, '.bounds');
        const dots = requireChild(shadow, '.dots');
        const legend = requireChild(shadow, '.legend');
        const empty = requireChild(shadow, '.empty');

        const plotted$ = combineLatest([traces$, layout$]).pipe(
            map(([traces, layout]) => ({ traces, layout, lanes: lanesOf(traces, layout) })),
            tap(({ traces, layout, lanes }) => {
                empty.hidden = traces.length > 0;

                lines.replaceChildren(
                    ...lanes.map(lane => {
                        const path = document.createElementNS(SVG, 'path');
                        path.setAttribute('d', lane.path);
                        path.style.setProperty('--trace', lane.colour);

                        return path;
                    }),
                );
                zeros.replaceChildren(
                    ...lanes.flatMap(({ zero }) => {
                        if (zero === null) {
                            return [];
                        }

                        const line = document.createElementNS(SVG, 'line');
                        line.setAttribute('x2', String(WIDTH));
                        line.setAttribute('y1', String(zero));
                        line.setAttribute('y2', String(zero));

                        return [line];
                    }),
                );
                bounds.replaceChildren(
                    ...boundsOf(lanes, layout).map(({ text, y, low }) => {
                        const label = document.createElement('span');
                        label.className = 'bound';
                        label.textContent = text;
                        label.toggleAttribute('data-low', low);
                        label.style.setProperty('--y', String(along(y)));

                        return label;
                    }),
                );
                dots.replaceChildren(
                    ...lanes.map(lane => {
                        const dot = document.createElement('span');
                        dot.className = 'dot';
                        dot.dataset['key'] = lane.key;
                        dot.style.setProperty('--trace', lane.colour);

                        return dot;
                    }),
                );
                legend.replaceChildren(
                    ...lanes.map(lane => {
                        const item = document.createElement('li');
                        item.dataset['key'] = lane.key;
                        item.style.setProperty('--trace', lane.colour);
                        const name = document.createElement('span');
                        name.className = 'name';
                        name.textContent = lane.label;
                        const value = document.createElement('span');
                        value.className = 'value';
                        item.append(name, value);

                        return item;
                    }),
                );
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

        return merge(plotted$, moment$, chosen$).pipe(map(() => undefined));
    }
}

customElements.define('hks-plot', HksPlot);
