import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { styleMap } from 'lit-html/directives/style-map.js';

import { renderOptions, type SelectChoice } from '../../shared/select/options.component.ts';
import { mountView, renderView, type RenderView, type Rendering } from '../../lib/lit.ts';
import { HksSelect, connectSelects$ } from '../../shared/select/select.component.ts';
import { EMPTY, merge, of, type Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import css from './appearance-editor.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = () =>
    html`<label class="head"
            ><span class="key">look</span><hks-select class="pick" aria-label="look"></hks-select
        ></label>
        <div class="swatches"></div>
        <div class="rows"></div>`;

export type PresetOption = {
    readonly value: string;
    readonly label: string;
};

export class HksAppearanceEditor extends HTMLElement {
    readonly selections$: Observable<string>;
    readonly changes$: Observable<ReadonlyMap<string, string>>;

    private readonly picker: HksSelect;
    private readonly rows: HTMLElement;
    private readonly swatches: HTMLElement;

    private readonly shadow: ShadowRoot;

    private readonly rendering: Rendering;

    private readonly tokenView: RenderView<readonly string[]>;
    private readonly swatchView: RenderView<readonly string[]>;
    private readonly optionsView: RenderView<readonly SelectChoice[]>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());

        this.picker = requireElement(shadow, '.pick', HksSelect);
        this.optionsView = renderOptions(this.picker);
        this.rows = requireChild(shadow, '.rows');
        this.swatches = requireChild(shadow, '.swatches');
        this.tokenView = renderView<readonly string[]>(this.rows, [], tokens =>
            repeat(
                tokens,
                item => item,
                token =>
                    html`<label class="row"
                        ><input
                            type="color"
                            class="ink"
                            data-token=${ifDefined(token)}
                            aria-label=${ifDefined(token)}
                        /><span class="name">${token}</span></label
                    >`,
            ),
        );
        this.swatchView = renderView<readonly string[]>(this.swatches, [], tokens =>
            repeat(
                tokens,
                item => item,
                token =>
                    html`<span
                        class="swatch"
                        style=${styleMap({ background: `var(--${token})` })}
                        title=${ifDefined(token)}
                    ></span>`,
            ),
        );

        // Only on change: the active look is app state, so the picker shows it rather than seeds it.
        this.selections$ = fromElementEvent$(this.picker, 'change').pipe(
            map(() => this.picker.value),
        );

        this.changes$ = fromElementEvent$(this.rows, 'input').pipe(
            mergeMap(event => (event.target instanceof HTMLInputElement ? of(this.read()) : EMPTY)),
        );
    }

    presets(options: readonly PresetOption[]): this {
        this.optionsView.update(options);

        return this;
    }

    tokens(tokens: readonly string[]): this {
        this.tokenView.update(tokens);
        this.swatchView.update(tokens);

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
            this.rendering.lifetime$,
            this.optionsView.lifetime$,
            this.tokenView.lifetime$,
            this.swatchView.lifetime$,
            merge(
                connectSelects$(this.shadow),
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
            ).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-appearance-editor', HksAppearanceEditor);
