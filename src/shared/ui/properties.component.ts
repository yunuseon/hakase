import { html, nothing } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { ref } from 'lit-html/directives/ref.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { asapScheduler, combineLatest, merge, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    map,
    mergeMap,
    observeOn,
    scan,
    share,
    startWith,
    tap,
} from 'rxjs/operators';
import { styleSheet } from '../../lib/dom.ts';
import { displayValue, renderView, type RenderView } from '../../lib/lit.ts';
import { fromElementEvent$, observeResize$ } from '../../lib/rx.ts';
import {
    charsFor,
    toggled,
    type End,
    type Property,
    type PropertyChange,
    type Section,
} from '../properties.ts';
import { connectSelects$, HksSelect } from '../select/select.component.ts';
import { connectChoices$ } from './choices.component.ts';
import { controlsSheet } from './controls.component.ts';
import { Icon } from './icon.component.ts';
import { ICONS } from './icons.ts';
import css from './properties.css?inline';

const sheet = styleSheet(css);

type View = { readonly sections: readonly Section[]; readonly open: ReadonlySet<string> };

// Only what changes how wide a row of choices is: a range moving every frame must not measure every frame.
const layoutKey = (sections: readonly Section[]): string =>
    sections
        .flatMap(({ properties }) => properties)
        .flatMap(property =>
            property.kind === 'choice'
                ? [`${property.id}:${property.options.map(({ label }) => label).join(',')}`]
                : [],
        )
        .join(';');

const unfilled: View = { sections: [], open: new Set() };

const shown = (element: Element | undefined, text: string) => {
    if (element instanceof HTMLInputElement) {
        displayValue(element, text);
    }
};

const field = (end: End, step: number) =>
    html`<input
        class="ui-field number"
        type="number"
        step=${step}
        data-id=${end.id}
        aria-label=${end.label}
        style=${styleMap({ '--chars': String(charsFor(end.value, step)) })}
        ${ref(element => {
            shown(element, String(end.value));
        })}
    />`;

const Row = (property: Property) => {
    const { id, label, hint } = property;

    switch (property.kind) {
        case 'choice':
            return html`<div class="row" data-kind="choice" title=${ifDefined(hint)}>
                <span class="key">${label}</span>
                <div class="fit" data-fits="true">
                    <div class="ui-choices" role="radiogroup" aria-label=${label}>
                        ${property.options.map(
                            option =>
                                html`<button
                                    class="ui-choice"
                                    type="button"
                                    role="radio"
                                    data-id=${id}
                                    data-value=${option.value}
                                    aria-checked=${String(option.value === property.value)}
                                    aria-label=${ifDefined(option.glyph === undefined ? undefined : option.label)}
                                    title=${ifDefined(option.glyph === undefined ? undefined : option.label)}
                                >
                                    ${option.glyph === undefined ? option.label : Icon(option.glyph)}
                                </button>`,
                        )}
                    </div>
                    <hks-select
                        class="ui-field"
                        data-id=${id}
                        aria-label=${label}
                        .value=${property.value}
                        >${property.options.map(
                            option => html`<option .value=${option.value}>${option.label}</option>`,
                        )}</hks-select
                    >
                </div>
            </div>`;
        case 'range':
            return html`<label class="row" data-kind="range" title=${ifDefined(hint)}>
                <span class="key">${label}</span>
                <input
                    class="ui-range"
                    type="range"
                    min=${property.min}
                    max=${property.max}
                    step=${property.step}
                    data-id=${id}
                    ?disabled=${property.driven !== undefined}
                    .value=${String(property.value)}
                />
                <span class="value">
                    ${
                        property.driven === undefined
                            ? html`<output>${property.text}</output>`
                            : html`<button
                                  type="button"
                                  class="ui-driven"
                                  data-why=${property.driven.why}
                                  data-chain=${property.driven.chain}
                              >
                                  ${property.driven.text ?? 'follows'}
                              </button>`
                    }${
                        property.aside === undefined
                            ? nothing
                            : html`<hks-select
                                  class="ui-field aside"
                                  data-id=${property.aside.id}
                                  aria-label=${property.aside.label}
                                  title=${ifDefined(property.aside.hint)}
                                  .value=${property.aside.value}
                                  .disabled=${property.driven !== undefined}
                                  >${property.aside.options.map(
                                      option =>
                                          html`<option .value=${option.value}>
                                              ${option.label}
                                          </option>`,
                                  )}</hks-select
                              >`
                    }
                </span>
            </label>`;
        case 'number':
            return html`<label class="row" data-kind="number" title=${ifDefined(hint)}>
                <span class="key">${label}</span>
                ${field({ id, label, value: property.value }, property.step)}${
                    property.unit === undefined
                        ? nothing
                        : html`<span class="value">${property.unit}</span>`
                }
            </label>`;
        case 'span':
            return html`<div
                class="row"
                data-kind="span"
                role="group"
                aria-label=${label}
                title=${ifDefined(hint)}
            >
                <span class="key">${label}</span>
                <span class="span">
                    ${field(property.low, property.step)}<span>to</span>${field(
                        property.high,
                        property.step,
                    )}
                </span>
            </div>`;
        case 'toggle':
            return html`<label class="row" data-kind="toggle" title=${ifDefined(hint)}>
                <span class="key">${label}</span>
                <input class="ui-check" type="checkbox" data-id=${id} .checked=${property.value} />
            </label>`;
        case 'colour':
            return html`<label class="row" data-kind="colour" title=${ifDefined(hint)}>
                <span class="key">${label}</span>
                <input class="ui-colour" type="color" data-id=${id} .value=${property.value} />
            </label>`;
        case 'text':
            return html`<label class="row" data-kind="text" title=${ifDefined(hint)}>
                <span class="key">${label}</span>
                <input
                    class="ui-field"
                    type="text"
                    data-id=${id}
                    placeholder=${property.placeholder}
                    ${ref(element => {
                        shown(element, property.value);
                    })}
                />
            </label>`;
        case 'action':
            return html`<div class="row" data-kind="action">
                <button
                    class="ui-button"
                    type="button"
                    data-action=${id}
                    title=${ifDefined(hint)}
                    ?disabled=${property.disabled === true}
                >
                    ${property.glyph === undefined ? nothing : Icon(property.glyph)}<span
                        >${label}</span
                    >
                </button>
            </div>`;
    }
};

const TEMPLATE = ({ sections, open }: View) =>
    repeat(
        sections,
        ({ id }) => id,
        ({ id, title, fold, properties, action }) =>
            html`<section
                class="section"
                aria-label=${ifDefined(title ?? undefined)}
                ?data-fold=${fold}
                ?data-open=${open.has(id)}
            >
                ${
                    title === null
                        ? nothing
                        : html`<h3 class="title">${title}</h3>
                              <button
                                  class="toggle"
                                  type="button"
                                  data-section=${id}
                                  aria-expanded=${String(open.has(id))}
                              >
                                  <span>${title}</span>${Icon(ICONS.collapse)}
                              </button>`
                }${
                    action === undefined
                        ? nothing
                        : html`<button
                              class="ui-icon reset"
                              type="button"
                              data-action=${action.id}
                              aria-label=${action.label}
                              title=${action.label}
                              ?disabled=${action.disabled}
                          >
                              ${Icon(action.glyph)}
                          </button>`
                }
                ${repeat(properties, ({ id: key }) => key, Row)}
            </section>`,
    );

const changeOf = (target: EventTarget | null, live: boolean): PropertyChange[] => {
    if (target instanceof HksSelect) {
        const id = target.getAttribute('data-id');
        return live || id === null ? [] : [{ id, value: target.value }];
    }

    if (!(target instanceof HTMLInputElement)) {
        return [];
    }

    const id = target.getAttribute('data-id');
    const moving = target.type === 'range' || target.type === 'color';

    if (id === null || moving !== live) {
        return [];
    }

    if (target.type === 'color') {
        return [{ id, value: target.value }];
    }

    if (target.type === 'checkbox') {
        return [{ id, value: target.checked }];
    }

    if (target.type === 'text') {
        return [{ id, value: target.value }];
    }

    return Number.isFinite(target.valueAsNumber) ? [{ id, value: target.valueAsNumber }] : [];
};

const attributeOf = (target: EventTarget | null, name: string): Element | null =>
    target instanceof Element ? target.closest(`[${name}]`) : null;

export class HksProperties extends HTMLElement {
    readonly changes$: Observable<PropertyChange>;

    private readonly shadow: ShadowRoot;
    private readonly root: HTMLElement;
    private readonly folds$: Observable<string>;
    private readonly rendering: RenderView<View>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        const root = document.createElement('div');
        root.className = 'properties';
        shadow.append(root);
        this.root = root;
        this.rendering = renderView(root, unfilled, TEMPLATE);

        const clicks$ = fromElementEvent$(root, 'click').pipe(share());

        this.folds$ = clicks$.pipe(
            mergeMap(({ target }) => {
                const id = attributeOf(target, 'data-section')?.getAttribute('data-section');
                return typeof id === 'string' ? [id] : [];
            }),
        );

        this.changes$ = merge(
            clicks$.pipe(
                mergeMap(({ target }): PropertyChange[] => {
                    const radio = attributeOf(target, 'data-value');
                    const action = attributeOf(target, 'data-action')?.getAttribute('data-action');
                    const id = radio?.getAttribute('data-id');
                    const value = radio?.getAttribute('data-value');

                    return typeof id === 'string' && typeof value === 'string'
                        ? [{ id, value }]
                        : typeof action === 'string'
                          ? [{ id: action, value: true }]
                          : [];
                }),
            ),
            fromElementEvent$(root, 'input').pipe(mergeMap(({ target }) => changeOf(target, true))),
            fromElementEvent$(root, 'change').pipe(
                mergeMap(({ target }) => changeOf(target, false)),
            ),
        );
    }

    connect$(sections$: Observable<readonly Section[]>): Observable<void> {
        const open$ = this.folds$.pipe(
            scan(toggled, new Set<string>()),
            startWith(new Set<string>()),
        );
        const rendered$ = combineLatest([sections$, open$]).pipe(
            tap(([sections, open]) => {
                this.rendering.update({ sections, open });
            }),
            share(),
        );

        return merge(
            this.rendering.lifetime$,
            connectChoices$(this.shadow),
            connectSelects$(this.shadow),
            merge(
                rendered$.pipe(
                    map(([sections, open]) => `${[...open].join()}|${layoutKey(sections)}`),
                    distinctUntilChanged(),
                ),
                observeResize$(this),
            ).pipe(
                observeOn(asapScheduler),
                map(() =>
                    [...this.root.querySelectorAll('.fit')].map(cell => ({
                        cell,
                        fits:
                            (cell.querySelector('.ui-choices')?.getBoundingClientRect().width ??
                                0) <=
                            cell.getBoundingClientRect().width + 0.5,
                    })),
                ),
                tap(cells => {
                    for (const { cell, fits } of cells) {
                        cell.setAttribute('data-fits', String(fits));
                    }
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-properties', HksProperties);
