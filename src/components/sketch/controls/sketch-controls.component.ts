import { combineLatest, concat, defer, EMPTY, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, startWith, switchMap, tap } from 'rxjs/operators';
import { requireElement, styleSheet } from '../../../lib/dom.ts';
import { fromElementEvent$ } from '../../../lib/rx.ts';
import {
    DRAW_MODES,
    defaultDimension,
    defaultDots,
    isDrawMode,
    type DrawMode,
    type DrawStyle,
    type PanelParams,
} from '../params.ts';
import css from './sketch-controls.css?inline';

const sheet = styleSheet(css);

type Readout = {
    readonly mode: DrawMode;
    readonly dimension: string;
    readonly baseSize: string;
    readonly depthScalar: string;
};

const sameReadout = (a: Readout, b: Readout): boolean =>
    a.mode === b.mode &&
    a.dimension === b.dimension &&
    a.baseSize === b.baseSize &&
    a.depthScalar === b.depthScalar;

const slider = (
    key: string,
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    only: DrawMode | null = null,
) => `
    <label class="row"${only === null ? '' : ` data-only="${only}"`}>
        <span class="key">${label}</span>
        <input class="dial" data-field="${key}" type="range"
               min="${min}" max="${max}" step="${step}" value="${value}" />
        <output class="read" data-read="${key}"></output>
    </label>
`;

const choice = (key: string, label: string, options = '') => `
    <label class="row">
        <span class="key">${label}</span>
        <select class="pick" data-pick="${key}" aria-label="${label}">${options}</select>
    </label>
`;

const modeOptions = DRAW_MODES.map(
    mode =>
        `<option value="${mode}"${mode === defaultDots.mode ? ' selected' : ''}>${mode}</option>`,
).join('');

const TEMPLATE = `
    <details class="panel">
        <summary class="handle">parameters</summary>
        <div class="grid">
            ${choice('formula', 'formula')}
            ${choice('theme', 'theme')}
            ${choice('mode', 'draw', modeOptions)}
            ${slider('dimension', 'lattice', 1, 128, 1, defaultDimension)}
            ${slider('baseSize', 'dot', 1, 20, 1, defaultDots.baseSize, 'dots')}
            ${slider('depthScalar', 'depth', 0.01, 2, 0.01, defaultDots.depthScalar, 'dots')}
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

        // switchMap: a mode's own fields are read only while it is selected, and keep their values.
        const draw$: Observable<DrawStyle> = chosen$('mode').pipe(
            mergeMap(mode => (isDrawMode(mode) ? of(mode) : EMPTY)),
            switchMap(mode =>
                mode === 'dots'
                    ? combineLatest({
                          mode: of(mode),
                          baseSize: number$('baseSize'),
                          depthScalar: number$('depthScalar'),
                      })
                    : of({ mode }),
            ),
        );

        this.changes$ = combineLatest({ dimension: number$('dimension'), draw: draw$ });
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
            map(({ dimension, draw }): Readout => ({
                mode: draw.mode,
                dimension: String(dimension),
                baseSize: draw.mode === 'dots' ? String(draw.baseSize) : '',
                depthScalar: draw.mode === 'dots' ? draw.depthScalar.toFixed(2) : '',
            })),
            distinctUntilChanged(sameReadout),
            tap(({ mode, ...texts }) => {
                for (const row of this.shadow.querySelectorAll('[data-only]')) {
                    if (row instanceof HTMLElement) {
                        row.hidden = row.dataset.only !== mode;
                    }
                }

                for (const [key, text] of Object.entries(texts)) {
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
