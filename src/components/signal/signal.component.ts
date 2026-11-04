import { combineLatest, merge, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    pairwise,
    scan,
    share,
    startWith,
    tap,
} from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { pointerGesture$, type Phase } from '../../shared/drag.ts';
import {
    FIELDS,
    isField,
    isParam,
    isRate,
    isShape,
    isStepCount,
    RATES,
    SHAPES,
    STEP_COUNTS,
    type Field,
    type Shape,
    type Signal,
    type SignalCommand,
    type Wave,
} from '../../shared/signal.ts';
import { dragStep, HEIGHT, markerOf, plotOf, typedValue, valueText, WIDTH } from './signal.ts';
import css from './signal.css?inline';

const sheet = styleSheet(css);
const MOVE_SLOP = 3;

const GLYPHS: Readonly<Record<Shape, string>> = {
    sine: 'M1 6 C5 -1 7 -1 12 6 S19 13 23 6',
    triangle: 'M1 10 L6.5 2 L17.5 10 L23 2',
    saw: 'M1 10 L12 2 V10 L23 2 V10',
    square: 'M1 10 V2 H12 V10 H23 V2',
    noise: 'M1 7 L4 3 L7 8 L10 5 L13 9 L16 2 L19 6 L23 4',
    steps: 'M1 10 V5 H7 V8 H13 V2 H19 V6 H23',
};

const HINTS: Readonly<Record<Field, string>> = {
    phase: 'where in its cycle the loop starts: drag, or click to type degrees',
    offset: 'the centre the wave swings around: drag, or click to type any number',
    depth: 'how far the wave swings either side, negative flips it: drag, or click to type',
    glide: 'how much of each step eases into the next: drag, or click to type a percentage',
};

const TEMPLATE = `
    <div class="scope" title="drag the wave: up and down moves its offset, left and right its phase">
        <svg viewBox="0 -4 ${WIDTH} ${HEIGHT + 8}" preserveAspectRatio="none" aria-hidden="true">
            <line class="zero" x1="0" x2="${WIDTH}" />
            <path class="wave" />
            <line class="now" y1="-4" y2="${HEIGHT + 4}" />
        </svg>
        <span class="bound max"></span>
        <span class="bound min"></span>
        <span class="dot"></span>
    </div>
    <div class="row">
        <div class="shapes" role="radiogroup" aria-label="shape">
            ${SHAPES.map(
                shape => `
                <button type="button" role="radio" data-shape="${shape}" title="${shape}" aria-label="${shape}">
                    <svg viewBox="0 0 24 12" aria-hidden="true"><path d="${GLYPHS[shape]}" /></svg>
                </button>`,
            ).join('')}
        </div>
        <div class="rates" role="radiogroup" aria-label="cycles per loop" title="cycles per loop">
            ${RATES.map(
                rate => `<button type="button" role="radio" data-rate="${rate}">${rate}</button>`,
            ).join('')}
        </div>
    </div>
    <div class="steps" data-only="steps">
        <div class="bars" title="draw the steps"></div>
        <div class="counts" role="radiogroup" aria-label="steps" title="steps per cycle">
            ${STEP_COUNTS.map(
                count =>
                    `<button type="button" role="radio" data-count="${count}">${count}</button>`,
            ).join('')}
        </div>
    </div>
    <div class="params">
        ${FIELDS.map(
            param => `
            <label class="param" title="${HINTS[param]}"${param === 'glide' ? ' data-only="steps"' : ''}>
                <span class="key">${param}</span>
                <input class="num" data-param="${param}" type="text" inputmode="decimal"
                       spellcheck="false" autocomplete="off" />
            </label>`,
        ).join('')}
    </div>
`;

type Pull = {
    readonly phase: Phase;
    readonly param: Field | null;
    readonly x: number;
    readonly y: number;
    readonly moved: number;
    readonly by: number;
};

const paramOf = (target: EventTarget | null): Field | null => {
    const param = target instanceof HTMLElement ? target.dataset['param'] : undefined;

    return param !== undefined && isField(param) ? param : null;
};

const fractionIn = (element: Element, { clientX, clientY }: PointerEvent) => {
    const rect = element.getBoundingClientRect();

    return {
        x: (clientX - rect.left) / Math.max(rect.width, 1),
        y: (clientY - rect.top) / Math.max(rect.height, 1),
    };
};

export class HksSignal extends HTMLElement {
    readonly commands$: Observable<SignalCommand>;

    private readonly shadow: ShadowRoot;
    private readonly pulls$: Observable<Pull>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        const scope = requireChild(shadow, '.scope');
        const params = requireChild(shadow, '.params');
        const bars = requireChild(shadow, '.bars');

        // Shared: the nudges and the click that opens the field for typing must read one gesture.
        this.pulls$ = pointerGesture$(
            params,
            ({ target }) =>
                paramOf(target) !== null &&
                !(target instanceof HTMLInputElement && target.disabled) &&
                shadow.activeElement !== target,
        ).pipe(
            scan(
                (pull: Pull, { phase, event }): Pull =>
                    phase === 'grab'
                        ? {
                              phase,
                              param: paramOf(event.target),
                              x: event.clientX,
                              y: event.clientY,
                              moved: 0,
                              by: 0,
                          }
                        : {
                              ...pull,
                              phase,
                              x: event.clientX,
                              y: event.clientY,
                              moved:
                                  pull.moved +
                                  Math.abs(event.clientX - pull.x) +
                                  Math.abs(event.clientY - pull.y),
                              by:
                                  (event.clientX - pull.x - (event.clientY - pull.y)) *
                                  (pull.param === null ? 0 : dragStep(pull.param, event.shiftKey)),
                          },
                { phase: 'release', param: null, x: 0, y: 0, moved: 0, by: 0 },
            ),
            share(),
        );

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
            this.pulls$.pipe(
                mergeMap(({ phase, param, moved, by }): SignalCommand[] =>
                    phase === 'move' && param !== null && moved >= MOVE_SLOP && by !== 0
                        ? [{ kind: 'nudge', param, by }]
                        : [],
                ),
            ),
            fromElementEvent$(params, 'change').pipe(
                mergeMap(({ target }): SignalCommand[] => {
                    const param = paramOf(target);
                    const value =
                        param !== null && target instanceof HTMLInputElement
                            ? typedValue(param, target.value)
                            : null;

                    return param === null || value === null ? [] : [{ kind: 'set', param, value }];
                }),
            ),
            fromElementEvent$(params, 'keydown').pipe(
                mergeMap((event): SignalCommand[] => {
                    const param = paramOf(event.target);
                    const step = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;

                    if (param === null || step === 0) {
                        return [];
                    }

                    // Taken, or the canvas reads the arrow as a step between sections.
                    event.preventDefault();

                    return [
                        { kind: 'nudge', param, by: step * dragStep(param, event.shiftKey) * 10 },
                    ];
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
        const params = requireChild(shadow, '.params');
        const bars = requireChild(shadow, '.bars');
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

        const steps$ = signal$.pipe(
            map(({ steps }) => steps),
            distinctUntilChanged(),
            tap(steps => {
                checked('[data-count]', 'count', String(steps.length));

                if (bars.children.length !== steps.length) {
                    bars.replaceChildren(
                        ...steps.map(() => {
                            const bar = document.createElement('span');
                            bar.className = 'bar';

                            return bar;
                        }),
                    );
                }

                steps.forEach((value, index) => {
                    const bar = bars.children[index];

                    if (bar instanceof HTMLElement) {
                        bar.style.setProperty('--value', String(value));
                    }
                });
            }),
        );

        const rate$ = signal$.pipe(
            map(({ rate }) => String(rate)),
            distinctUntilChanged(),
            tap(rate => {
                checked('[data-rate]', 'rate', rate);
            }),
        );

        // A field that loses focus is written again, so Escape or a refused entry shows the value it had.
        const left$ = fromElementEvent$(params, 'focusout').pipe(startWith(null));

        const fields$ = FIELDS.map(param =>
            combineLatest([
                combineLatest([
                    signal$.pipe(map(signal => valueText(param, signal[param]))),
                    wave$.pipe(map(({ mods }) => isParam(param) && mods[param] !== null)),
                ]).pipe(distinctUntilChanged(([a, x], [b, y]) => a === b && x === y)),
                left$,
            ]).pipe(
                tap(([[text, driven]]) => {
                    const input = requireElement(
                        shadow,
                        `[data-param="${param}"]`,
                        HTMLInputElement,
                    );
                    input.disabled = driven;
                    input.closest('.param')?.toggleAttribute('data-driven', driven);

                    // Not while it is being typed into: the fold's value would overwrite the draft.
                    if (shadow.activeElement !== input) {
                        input.value = driven ? 'signal' : text;
                    }
                }),
            ),
        );

        const typing$ = this.pulls$.pipe(
            filter(
                ({ phase, param, moved }) =>
                    phase === 'release' && param !== null && moved < MOVE_SLOP,
            ),
            tap(({ param }) => {
                const input = shadow.querySelector(`[data-param="${param}"]`);

                if (input instanceof HTMLInputElement) {
                    input.focus();
                    input.select();
                }
            }),
        );

        const keys$ = fromElementEvent$(params, 'keydown').pipe(
            tap(({ key, target }) => {
                if (target instanceof HTMLInputElement && (key === 'Enter' || key === 'Escape')) {
                    // Escape empties it first, so the change that the blur raises is refused.
                    if (key === 'Escape') {
                        target.value = '';
                    }

                    target.blur();
                }
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
            share(),
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

        return merge(shape$, steps$, rate$, ...fields$, typing$, keys$, plot$, marker$).pipe(
            map(() => undefined),
        );
    }
}

customElements.define('hks-signal', HksSignal);
