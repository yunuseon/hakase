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

const choice = (key: string, label: string) => `
    <label class="row">
        <span class="key">${label}</span>
        <select class="pick" data-pick="${key}" aria-label="${label}"></select>
    </label>
`;

const TEMPLATE = `
    <details class="panel">
        <summary class="handle">parameters</summary>
        <div class="grid">
            ${choice('formula', 'formula')}
            ${choice('theme', 'theme')}
            ${slider('dimension', 'lattice', 1, 128, 1, defaultParams.dimension)}
            ${slider('baseSize', 'dot', 1, 20, 1, defaultParams.baseSize)}
            ${slider('depthScalar', 'depth', 0.01, 2, 0.01, defaultParams.depthScalar)}
        </div>
    </details>
`;

export type PresetOption = {
    readonly value: string;
    readonly label: string;
};

export class HksSketchControls extends HTMLElement {
    readonly changes$: Observable<PanelParams>;
    readonly selectedFormula$: Observable<string>;
    readonly selectedTheme$: Observable<string>;

    private readonly shadow: ShadowRoot;

    constructor() {
        super();

        this.shadow = this.attachShadow({ mode: 'open' });
        this.shadow.adoptedStyleSheets = [sheet];
        this.shadow.innerHTML = TEMPLATE;

        // Deferred: the current option is only known once presets() has filled the list.
        const chosen$ = (key: string): Observable<string> =>
            defer(() => {
                const pick = this.pick(key);

                return concat(
                    of(pick.value),
                    fromElementEvent$(pick, 'change').pipe(map(() => pick.value)),
                );
            });

        this.selectedFormula$ = chosen$('formula');
        this.selectedTheme$ = chosen$('theme');

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
        });
    }

    presets(formulas: readonly PresetOption[], themes: readonly PresetOption[]): this {
        const fill = (key: string, options: readonly PresetOption[]) => {
            this.pick(key).replaceChildren(
                ...options.map(({ value, label }) => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = label;

                    return option;
                }),
            );
        };

        fill('formula', formulas);
        fill('theme', themes);

        return this;
    }

    private pick(key: string): HTMLSelectElement {
        return requireElement(this.shadow, `[data-pick="${key}"]`, HTMLSelectElement);
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
