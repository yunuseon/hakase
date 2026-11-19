import { connectChoices$ } from '../../shared/ui/choices.component.ts';
import { controlsSheet, whys$ } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { styleMap } from 'lit-html/directives/style-map.js';

import { mountView, renderView, type RenderView, type Rendering } from '../../lib/lit.ts';
import { combineLatest, merge, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    pairwise,
    shareReplay,
    startWith,
    tap,
} from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { pointerGesture$ } from '../../shared/drag.ts';
import {
    isRate,
    isShape,
    isStepCount,
    RATES,
    SHAPES,
    STEP_COUNTS,
    type Shape,
    type Signal,
    stepAt,
    type SignalCommand,
    type Wave,
} from '../../shared/signal.ts';
import { HEIGHT, markerOf, plotOf, valueText, WIDTH } from './signal.ts';
import css from './signal.css?inline';

const sheet = styleSheet(css);

const GLYPHS: Readonly<Record<Shape, string>> = {
    sine: 'M1 6 C5 -1 7 -1 12 6 S19 13 23 6',
    triangle: 'M1 10 L6.5 2 L17.5 10 L23 2',
    saw: 'M1 10 L12 2 V10 L23 2 V10',
    square: 'M1 10 V2 H12 V10 H23 V2',
    noise: 'M1 7 L4 3 L7 8 L10 5 L13 9 L16 2 L19 6 L23 4',
    steps: 'M1 10 V5 H7 V8 H13 V2 H19 V6 H23',
};

const TEMPLATE = () =>
    html`<div class="ui-staged">
        <div data-stage>
            <div
                class="scope"
                title="drag the wave: up and down moves its offset, left and right its phase"
            >
                <svg
                    viewBox=${ifDefined(`0 -4 ${WIDTH} ${HEIGHT + 8}`)}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                >
                    <line class="zero" x1="0" x2=${ifDefined(WIDTH)}></line>
                    <path class="wave"></path>
                    <line class="now" y1="-4" y2=${ifDefined(HEIGHT + 4)}></line></svg
                ><span class="bound max"></span><span class="bound min"></span
                ><span class="dot"></span>
            </div>
            <div class="steps" data-only="steps" data-detail>
                <div class="bars" title="draw the steps"></div>
                <div
                    class="ui-choices counts"
                    role="radiogroup"
                    aria-label="steps"
                    title="steps per cycle"
                >
                    ${STEP_COUNTS.map(
                        count =>
                            html`<button
                                class="ui-choice"
                                type="button"
                                role="radio"
                                data-count=${ifDefined(count)}
                            >
                                ${count}
                            </button>`,
                    )}
                </div>
            </div>
        </div>
        <div class="controls" data-controls data-detail>
            <div class="row">
                <div class="ui-choices shapes" role="radiogroup" aria-label="shape">
                    ${SHAPES.map(
                        shape =>
                            html`<button
                                class="ui-choice"
                                type="button"
                                role="radio"
                                data-shape=${ifDefined(shape)}
                                title=${ifDefined(shape)}
                                aria-label=${ifDefined(shape)}
                            >
                                <svg viewBox="0 0 24 12" aria-hidden="true">
                                    <path d=${ifDefined(GLYPHS[shape])}></path>
                                </svg>
                            </button>`,
                    )}
                </div>
                <div
                    class="ui-choices rates"
                    role="radiogroup"
                    aria-label="cycles per loop"
                    title="cycles per loop"
                >
                    ${RATES.map(
                        rate =>
                            html`<button
                                class="ui-choice"
                                type="button"
                                role="radio"
                                data-rate=${ifDefined(rate)}
                            >
                                ${rate}
                            </button>`,
                    )}
                </div>
            </div>
            <slot></slot>
        </div>
    </div>`;

const fractionIn = (element: Element, { clientX, clientY }: PointerEvent) => {
    const rect = element.getBoundingClientRect();

    return {
        x: (clientX - rect.left) / Math.max(rect.width, 1),
        y: (clientY - rect.top) / Math.max(rect.height, 1),
    };
};

export class HksSignal extends HTMLElement {
    readonly commands$: Observable<SignalCommand>;
    readonly whys$: Observable<string> = whys$(this);

    private readonly shadow: ShadowRoot;

    private readonly rendering: Rendering;

    private readonly barView: RenderView<{
        readonly steps: readonly number[];
        readonly current: number | null;
    }>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());
        this.barView = renderView<{
            readonly steps: readonly number[];
            readonly current: number | null;
        }>(requireChild(shadow, '.bars'), { steps: [], current: -1 }, view =>
            repeat(
                view.steps,
                (_item, index) => index,
                (value, index) =>
                    html`<span
                        class="bar"
                        style=${styleMap({ '--value': String(value) })}
                        data-current=${ifDefined(index === view.current ? '' : undefined)}
                    ></span>`,
            ),
        );

        const bars = requireChild(shadow, '.bars');
        const scope = requireChild(shadow, '.scope');

        this.commands$ = merge(
            fromElementEvent$(requireChild(shadow, '.shapes'), 'click').pipe(
                mergeMap(({ target }): SignalCommand[] => {
                    const button =
                        target instanceof Element ? target.closest('[data-shape]') : null;
                    const shape =
                        button instanceof HTMLElement ? button.dataset['shape'] : undefined;

                    return shape !== undefined && isShape(shape) ? [{ kind: 'shape', shape }] : [];
                }),
            ),
            fromElementEvent$(requireChild(shadow, '.counts'), 'click').pipe(
                mergeMap(({ target }): SignalCommand[] => {
                    const count =
                        target instanceof HTMLElement ? Number(target.dataset['count']) : NaN;

                    return isStepCount(count) ? [{ kind: 'step-count', count }] : [];
                }),
            ),
            pointerGesture$(bars).pipe(
                map(({ phase, event }) => ({ phase, at: fractionIn(bars, event) })),
                // Or the very first stroke's grab has nothing to pair with and is lost.
                startWith({ phase: 'release' as const, at: { x: 0, y: 0 } }),
                pairwise(),
                mergeMap(([before, { phase, at }]): SignalCommand[] =>
                    phase === 'release'
                        ? []
                        : [
                              {
                                  kind: 'draw',
                                  from: phase === 'grab' ? at : before.at,
                                  to: at,
                              },
                          ],
                ),
            ),
            fromElementEvent$(requireChild(shadow, '.rates'), 'click').pipe(
                mergeMap(({ target }): SignalCommand[] => {
                    const rate =
                        target instanceof HTMLElement ? Number(target.dataset['rate']) : NaN;

                    return isRate(rate) ? [{ kind: 'rate', rate }] : [];
                }),
            ),
            pointerGesture$(scope).pipe(
                map(({ phase, event }) => {
                    const rect = scope.getBoundingClientRect();

                    return {
                        phase,
                        x: event.clientX / Math.max(rect.width, 1),
                        y: event.clientY / Math.max(rect.height, 1),
                    };
                }),
                pairwise(),
                filter(([from, to]) => from.phase !== 'release' && to.phase === 'move'),
                map(([from, to]): SignalCommand => ({
                    kind: 'drag-wave',
                    dx: to.x - from.x,
                    dy: to.y - from.y,
                })),
            ),
        );
    }

    connect$(
        signal$: Observable<Signal>,
        wave$: Observable<Wave>,
        t$: Observable<number>,
    ): Observable<void> {
        const shadow = this.shadow;
        const line = requireElement(shadow, '.wave', SVGPathElement);
        const now = requireElement(shadow, '.now', SVGLineElement);
        const zero = requireElement(shadow, '.zero', SVGLineElement);
        const dot = requireChild(shadow, '.dot');
        const max = requireChild(shadow, '.max');
        const min = requireChild(shadow, '.min');

        const checked = (selector: string, key: string, value: string) => {
            for (const button of shadow.querySelectorAll(selector)) {
                if (button instanceof HTMLElement) {
                    button.setAttribute('aria-checked', String(button.dataset[key] === value));
                }
            }
        };

        const shape$ = signal$.pipe(
            map(({ shape }) => shape),
            distinctUntilChanged(),
            tap(shape => {
                checked('[data-shape]', 'shape', shape);

                for (const element of shadow.querySelectorAll('[data-only]')) {
                    if (element instanceof HTMLElement) {
                        element.hidden = element.dataset['only'] !== shape;
                    }
                }
            }),
        );

        const rate$ = signal$.pipe(
            map(({ rate }) => String(rate)),
            distinctUntilChanged(),
            tap(rate => {
                checked('[data-rate]', 'rate', rate);
            }),
        );

        const plot$ = wave$.pipe(
            map(wave => ({ wave, plot: plotOf(wave) })),
            tap(({ plot }) => {
                line.setAttribute('d', plot.path);
                max.textContent = valueText('offset', plot.max);
                min.textContent = valueText('offset', plot.min);
                zero.style.visibility = plot.zero === null ? 'hidden' : 'visible';

                if (plot.zero !== null) {
                    zero.setAttribute('y1', String(plot.zero));
                    zero.setAttribute('y2', String(plot.zero));
                }
            }),
            // Replayed: the marker subscribes after the plot, and a wave that arrives at once would never reach it.
            shareReplay({ bufferSize: 1, refCount: true }),
        );

        const marker$ = combineLatest([plot$, t$]).pipe(
            map(([{ wave, plot }, t]) => markerOf(wave, plot, t)),
            tap(({ x, y }) => {
                now.setAttribute('x1', String(x));
                now.setAttribute('x2', String(x));
                dot.style.setProperty('--x', String(x / WIDTH));
                dot.style.setProperty('--y', String((y + 4) / (HEIGHT + 8)));
            }),
        );

        // One pipe for the bars and the mark, or a rebuilt strip could lose the step being played.
        const steps$ = combineLatest([wave$, t$]).pipe(
            map(([wave, t]) => ({ steps: wave.signal.steps, current: stepAt(wave, t) })),
            distinctUntilChanged((a, b) => a.steps === b.steps && a.current === b.current),
            tap(({ steps, current }) => {
                checked('[data-count]', 'count', String(steps.length));

                this.barView.update({ steps, current });
            }),
        );

        return merge(
            this.rendering.lifetime$,
            connectChoices$(this.shadow),
            this.barView.lifetime$,
            merge(shape$, steps$, rate$, plot$, marker$).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-signal', HksSignal);
