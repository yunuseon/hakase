import { EMPTY, merge, of, type Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import css from './appearance-editor.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <label class="head">
        <span class="key">look</span>
        <select class="pick" aria-label="look"></select>
    </label>
    <div class="swatches"></div>
    <div class="rows"></div>
`;

export type PresetOption = {
    readonly value: string;
    readonly label: string;
};

export class HksAppearanceEditor extends HTMLElement {
    readonly selections$: Observable<string>;
    readonly changes$: Observable<ReadonlyMap<string, string>>;

    private readonly picker: HTMLSelectElement;
    private readonly rows: HTMLElement;
    private readonly swatches: HTMLElement;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.picker = requireElement(shadow, '.pick', HTMLSelectElement);
        this.rows = requireChild(shadow, '.rows');
        this.swatches = requireChild(shadow, '.swatches');

        // Only on change: the active look is app state, so the picker shows it rather than seeds it.
        this.selections$ = fromElementEvent$(this.picker, 'change').pipe(
            map(() => this.picker.value),
        );

        this.changes$ = fromElementEvent$(this.rows, 'input').pipe(
            mergeMap(event => (event.target instanceof HTMLInputElement ? of(this.read()) : EMPTY)),
        );
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

    tokens(tokens: readonly string[]): this {
        this.rows.replaceChildren(
            ...tokens.map(token => {
                const row = document.createElement('label');
                row.className = 'row';

                const name = document.createElement('span');
                name.className = 'name';
                name.textContent = token;

                const input = document.createElement('input');
                input.type = 'color';
                input.className = 'ink';
                input.dataset['token'] = token;
                input.setAttribute('aria-label', token);

                row.append(input, name);

                return row;
            }),
        );

        this.swatches.replaceChildren(
            ...tokens.map(token => {
                const swatch = document.createElement('span');
                swatch.className = 'swatch';
                swatch.style.background = `var(--${token})`;
                swatch.title = token;

                return swatch;
            }),
        );

        return this;
    }

    private inputs(): HTMLInputElement[] {
        return [...this.rows.querySelectorAll('input')];
    }

    private read(): ReadonlyMap<string, string> {
        return new Map(this.inputs().map(input => [input.dataset['token'] ?? '', input.value]));
    }

    connect$(
        selected$: Observable<string>,
        values$: Observable<ReadonlyMap<string, string>>,
    ): Observable<void> {
        return merge(
            selected$.pipe(
                tap(name => {
                    this.picker.value = name;
                }),
            ),
            values$.pipe(
                tap(values => {
                    for (const input of this.inputs()) {
                        const value = values.get(input.dataset['token'] ?? '');

                        if (value !== undefined && input.value !== value) {
                            input.value = value;
                        }
                    }
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-appearance-editor', HksAppearanceEditor);
