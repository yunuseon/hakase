import { combineLatest, merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import {
    isRate,
    isShape,
    RATES,
    SHAPES,
    type Signal,
    type SignalCommand,
} from '../../shared/signal.ts';
import { HEIGHT, markerOf, pathOf, WIDTH } from './signal.ts';
import css from './signal.css?inline';

const sheet = styleSheet(css);

const UNITS = ['phase', 'low', 'high'] as const;
type Unit = (typeof UNITS)[number];

const unitRow = (unit: Unit, label: string, hint: string) => `
    <label class="row" title="${hint}">
        <span class="key">${label}</span>
        <input class="dial" data-unit="${unit}" type="range" min="0" max="1" step="0.01" />
        <output class="read" data-read="${unit}"></output>
    </label>
`;

const TEMPLATE = `
    <div class="scope">
        <svg viewBox="0 -4 ${WIDTH} ${HEIGHT + 8}" preserveAspectRatio="none" aria-hidden="true">
            <line class="axis" x1="0" y1="${HEIGHT}" x2="${WIDTH}" y2="${HEIGHT}" />
            <line class="axis" x1="0" y1="0" x2="${WIDTH}" y2="0" />
            <path class="wave" />
            <line class="now" y1="-4" y2="${HEIGHT + 4}" />
        </svg>
        <span class="dot"></span>
    </div>
    <div class="rows">
        <label class="row">
            <span class="key">shape</span>
            <select class="pick" data-pick="shape" aria-label="shape">
                ${SHAPES.map(shape => `<option value="${shape}">${shape}</option>`).join('')}
            </select>
        </label>
        <label class="row" title="a whole number of cycles, so every loop ends where it began">
            <span class="key">rate</span>
            <select class="pick" data-pick="rate" aria-label="rate">
                ${RATES.map(rate => `<option value="${rate}">${rate}× per loop</option>`).join('')}
            </select>
        </label>
        ${unitRow('phase', 'phase', 'where in its cycle the loop starts')}
        ${unitRow('low', 'low', 'the value at the bottom of the wave')}
        ${unitRow('high', 'high', 'the value at the top of the wave; below low turns it upside down')}
    </div>
`;

const isUnit = (value: string): value is Unit => UNITS.some(unit => unit === value);

export class HksSignal extends HTMLElement {
    readonly commands$: Observable<SignalCommand>;

    private readonly shadow: ShadowRoot;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        const rows = requireChild(shadow, '.rows');

        this.commands$ = merge(
            fromElementEvent$(rows, 'change').pipe(
                mergeMap(({ target }): SignalCommand[] => {
                    if (!(target instanceof HTMLSelectElement)) {
                        return [];
                    }

                    const value = target.value;
                    const rate = Number(value);

                    return target.dataset['pick'] === 'shape' && isShape(value)
                        ? [{ kind: 'shape', shape: value }]
                        : target.dataset['pick'] === 'rate' && isRate(rate)
                          ? [{ kind: 'rate', rate }]
                          : [];
                }),
            ),
            fromElementEvent$(rows, 'input').pipe(
                mergeMap(({ target }): SignalCommand[] => {
                    const unit = target instanceof HTMLInputElement ? target.dataset['unit'] : '';

                    if (
                        !(target instanceof HTMLInputElement) ||
                        unit === undefined ||
                        !isUnit(unit)
                    ) {
                        return [];
                    }

                    const value = target.valueAsNumber;

                    switch (unit) {
                        case 'phase':
                            return [{ kind: 'phase', phase: value }];
                        case 'low':
                            return [{ kind: 'low', low: value }];
                        case 'high':
                            return [{ kind: 'high', high: value }];
                    }
                }),
            ),
        );
    }

    connect$(signal$: Observable<Signal>, t$: Observable<number>): Observable<void> {
        const shadow = this.shadow;
        const wave = requireElement(shadow, '.wave', SVGPathElement);
        const now = requireElement(shadow, '.now', SVGLineElement);
        const dot = requireChild(shadow, '.dot');

        const picks$ = (['shape', 'rate'] as const).map(key =>
            signal$.pipe(
                map(signal => String(signal[key])),
                distinctUntilChanged(),
                tap(value => {
                    requireElement(shadow, `[data-pick="${key}"]`, HTMLSelectElement).value = value;
                }),
            ),
        );

        const units$ = UNITS.map(unit =>
            signal$.pipe(
                map(signal => signal[unit]),
                distinctUntilChanged(),
                tap(value => {
                    requireElement(shadow, `[data-unit="${unit}"]`, HTMLInputElement).value =
                        String(value);
                    requireElement(shadow, `[data-read="${unit}"]`, HTMLOutputElement).textContent =
                        value.toFixed(2);
                }),
            ),
        );

        const path$ = signal$.pipe(
            map(pathOf),
            distinctUntilChanged(),
            tap(path => {
                wave.setAttribute('d', path);
            }),
        );

        const marker$ = combineLatest([signal$, t$]).pipe(
            map(([signal, t]) => markerOf(signal, t)),
            tap(({ x, y }) => {
                now.setAttribute('x1', String(x));
                now.setAttribute('x2', String(x));
                dot.style.setProperty('--x', String(x / WIDTH));
                dot.style.setProperty('--y', String((y + 4) / (HEIGHT + 8)));
            }),
        );

        return merge(...picks$, ...units$, path$, marker$).pipe(map(() => undefined));
    }
}

customElements.define('hks-signal', HksSignal);
