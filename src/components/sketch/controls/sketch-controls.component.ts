import { combineLatest, concat, defer, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, startWith, tap } from 'rxjs/operators';
import { requireElement, styleSheet } from '../../../lib/dom.ts';
import { fromElementEvent$ } from '../../../lib/rx.ts';
import { defaultParams, type PanelParams } from '../params.ts';
import css from './sketch-controls.css?inline';

const sheet = styleSheet(css);

type Readout = {
    readonly dimension: string;
    readonly baseSize: string;
    readonly depthScalar: string;
};

const sameReadout = (a: Readout, b: Readout): boolean =>
    a.dimension === b.dimension && a.baseSize === b.baseSize && a.depthScalar === b.depthScalar;

const slider = (
    key: string,
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
) => `
    <label class="row">
        <span class="key">${label}</span>
        <input class="dial" data-field="${key}" type="range"
               min="${min}" max="${max}" step="${step}" value="${value}" />
        <output class="read" data-read="${key}"></output>
    </label>
`;

const swatch = (key: string, label: string, value: string) => `
    <label class="row">
        <span class="key">${label}</span>
        <input class="ink" data-field="${key}" type="color" value="${value}" />
    </label>
`;

const TEMPLATE = `
    <details class="panel">
        <summary class="handle">parameters</summary>
        <div class="grid">
            <label class="row">
                <span class="key">formula</span>
                <select class="pick" aria-label="formula"></select>
            </label>
            ${slider('dimension', 'lattice', 1, 128, 1, defaultParams.dimension)}
            ${slider('baseSize', 'dot', 1, 20, 1, defaultParams.baseSize)}
            ${slider('depthScalar', 'depth', 0.01, 2, 0.01, defaultParams.depthScalar)}
            ${swatch('color1', 'back', defaultParams.color1)}
            ${swatch('color2', 'mid', defaultParams.color2)}
            ${swatch('color3', 'fore', defaultParams.color3)}
        </div>
    </details>
`;

export type PresetOption = {
    readonly value: string;
    readonly label: string;
};

export class HksSketchControls extends HTMLElement {
    readonly changes$: Observable<PanelParams>;
    readonly selections$: Observable<string>;

    private readonly shadow: ShadowRoot;
    private readonly picker: HTMLSelectElement;

    constructor() {
        super();

        this.shadow = this.attachShadow({ mode: 'open' });
        this.shadow.adoptedStyleSheets = [sheet];
        this.shadow.innerHTML = TEMPLATE;

        this.picker = requireElement(this.shadow, '.pick', HTMLSelectElement);

        // Deferred: the current option is only known once presets() has filled the list.
        this.selections$ = defer(() =>
            concat(
                of(this.picker.value),
                fromElementEvent$(this.picker, 'change').pipe(map(() => this.picker.value)),
            ),
        );

        const field = (key: string): HTMLInputElement =>
            requireElement(this.shadow, `[data-field="${key}"]`, HTMLInputElement);

        // Deferred: the seed is whatever the input holds when someone subscribes.
        const text$ = (key: string): Observable<string> =>
            defer(() => {
                const input = field(key);

                return fromElementEvent$(input, 'input').pipe(
                    map(() => input.value),
                    startWith(input.value),
                );
            });

        const number$ = (key: string): Observable<number> =>
            text$(key).pipe(map(value => Number(value)));

        this.changes$ = combineLatest({
            dimension: number$('dimension'),
            baseSize: number$('baseSize'),
            depthScalar: number$('depthScalar'),
            color1: text$('color1'),
            color2: text$('color2'),
            color3: text$('color3'),
        });
    }

    presets(options: readonly PresetOption[]): this {
        this.picker.replaceChildren(
            ...options.map(({ value, label }) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;

                return option;
            }),
        );

        return this;
    }

    connect$(params$: Observable<PanelParams>): Observable<void> {
        return params$.pipe(
            map(({ dimension, baseSize, depthScalar }): Readout => ({
                dimension: String(dimension),
                baseSize: String(baseSize),
                depthScalar: depthScalar.toFixed(2),
            })),
            distinctUntilChanged(sameReadout),
            tap(readout => {
                for (const [key, text] of Object.entries(readout)) {
                    requireElement(
                        this.shadow,
                        `[data-read="${key}"]`,
                        HTMLOutputElement,
                    ).textContent = text;
                }
            }),
            map(() => undefined),
        );
    }
}

customElements.define('hks-sketch-controls', HksSketchControls);
