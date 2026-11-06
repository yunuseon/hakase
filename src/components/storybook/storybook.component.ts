import { ICONS } from '../../shared/ui/icons.ts';
import { Icon } from '../../shared/ui/icon.component.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html, nothing } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { merge, type Observable } from 'rxjs';
import { map, mergeMap, share, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { renderView, type RenderView } from '../../lib/lit.ts';
import { HksSelect, connectSelects$ } from '../../shared/select/select.component.ts';
import {
    initialBook,
    bookView,
    type BookChange,
    type BookView,
    type EventEntry,
} from './storybook.ts';
import css from './storybook.css?inline';

const sheet = styleSheet(css);
const template = (view: BookView) =>
    html` <div class="frame">
        <nav aria-label="Component catalogue">
            <header>
                <span class="eyebrow">Hakase</span>
                <h2>Storybook</h2>
                <span class="count">${view.total} stories</span>
            </header>
            <input
                class="ui-field search"
                type="search"
                aria-label="Search components"
                placeholder="Search components…"
                .value=${view.state.query}
            />
            <div class="catalogue">
                ${repeat(
                    view.groups,
                    group => group,
                    group =>
                        html`<section>
                            <h3>${group}</h3>
                            ${repeat(
                                view.matches.filter(story => story.group === group),
                                story => story.id,
                                story =>
                                    html`<button
                                        type="button"
                                        class="story"
                                        data-story=${story.id}
                                        aria-current=${view.state.selected === story.id ? 'true' : 'false'}
                                    >
                                        <span>${story.title}</span
                                        ><small>${story.elements[0] ?? 'Foundations'}</small>
                                    </button>`,
                            )}
                        </section>`,
                )}
                <p class="ui-empty empty" ?hidden=${view.matches.length > 0}>
                    No matching components.
                </p>
            </div>
        </nav>
        <main>
            <header class="story-head">
                <div>
                    <span class="eyebrow">${view.story?.group}</span>
                    <h1>${view.story?.title ?? 'No component selected'}</h1>
                    <p>${view.story?.description}</p>
                </div>
                <button
                    class="ui-icon icon-action"
                    type="button"
                    data-action="reset"
                    aria-label="Reset example"
                    title="Reset example"
                >
                    ${Icon(ICONS.reset)}
                </button>
            </header>
            <div class="toolbar">
                <label
                    >Variant<hks-select
                        class="ui-field variant"
                        aria-label="Story variant"
                        .value=${view.state.variant}
                        >${repeat(
                            view.story?.variants ?? [],
                            variant => variant.id,
                            variant => html`<option .value=${variant.id}>${variant.title}</option>`,
                        )}</hks-select
                    ></label
                >
                <label
                    >Appearance<hks-select
                        class="ui-field appearance"
                        aria-label="Preview appearance"
                        .value=${view.state.appearance}
                        >${repeat(
                            view.appearances,
                            option => option.value,
                            option => html`<option .value=${option.value}>${option.label}</option>`,
                        )}</hks-select
                    ></label
                >
                <label
                    >Width<hks-select
                        class="ui-field width"
                        aria-label="Preview width"
                        .value=${view.state.width}
                        ><option value="auto">Fill</option>
                        <option value="240">240 px</option>
                        <option value="360">360 px</option>
                        <option value="600">600 px</option></hks-select
                    ></label
                >
                <button
                    class="ui-button run"
                    type="button"
                    data-action="action"
                    ?hidden=${view.story?.action == null}
                >
                    ${Icon(ICONS.play)} ${view.story?.action}
                </button>
            </div>
            <div class="controls" ?hidden=${(view.story?.controls.length ?? 0) === 0}>
                <label ?hidden=${!view.story?.controls.includes('label')}
                    >Label<input
                        class="ui-field label-control"
                        aria-label="Example label"
                        .value=${view.state.args.label}
                /></label>
                <label class="range-control" ?hidden=${!view.story?.controls.includes('value')}
                    >Value<input
                        class="ui-range value-control"
                        aria-label="Example value"
                        type="range"
                        min="0"
                        max="100"
                        .value=${String(view.state.args.value)}
                    /><output>${view.state.args.value}</output></label
                >
                <label class="check-control" ?hidden=${!view.story?.controls.includes('disabled')}
                    ><input
                        class="ui-check disabled-control"
                        type="checkbox"
                        aria-label="Disable example"
                        .checked=${view.state.args.disabled}
                    />
                    Disabled</label
                >
            </div>
            <div class="preview-scroll">
                <div
                    class="preview"
                    style=${styleMap({ 'inline-size': view.state.width === 'auto' ? '100%' : `${view.state.width}px`, 'block-size': `${view.story?.height ?? 300}px` })}
                >
                    <div class="sample"></div>
                </div>
            </div>
            <p class="isolation">Sandbox · changes stay in this example</p>
            <details class="usage">
                <summary>Usage</summary>
                <pre><code>${view.story?.code}</code></pre>
            </details>
            <section class="event-section">
                <header>
                    <h3>Events</h3>
                    <button
                        class="ui-icon icon-action"
                        type="button"
                        data-action="clear"
                        aria-label="Clear event log"
                        title="Clear event log"
                    >
                        ${Icon(ICONS.remove)}
                    </button>
                </header>
                <div class="events" aria-live="polite"></div>
            </section>
        </main>
    </div>`;

export class HksStorybook extends HTMLElement {
    readonly changes$: Observable<BookChange>;
    private readonly root: ShadowRoot;
    private readonly rendering: RenderView<BookView>;
    private readonly preview: RenderView<HTMLElement | null>;
    private readonly log: RenderView<readonly EventEntry[]>;

    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        this.root = root;
        root.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView(root, bookView(initialBook([]), []), template);
        this.preview = renderView<HTMLElement | null>(
            requireChild(root, '.sample'),
            null,
            element => element ?? nothing,
        );
        this.log = renderView<readonly EventEntry[]>(requireChild(root, '.events'), [], entries =>
            entries.length === 0
                ? html`<p class="ui-empty empty">Interact with the example to see its events.</p>`
                : html`<ol>
                      ${repeat(
                          entries,
                          entry => entry.seq,
                          entry =>
                              html`<li>
                                  <span>${entry.seq}</span><b>${entry.name}</b
                                  ><code>${entry.detail}</code>
                              </li>`,
                      )}
                  </ol>`,
        );
        const frame = requireChild(root, '.frame');
        this.changes$ = merge(
            fromElementEvent$(frame, 'input').pipe(
                mergeMap(({ target }): BookChange[] =>
                    target instanceof HTMLInputElement
                        ? target.classList.contains('search')
                            ? [{ kind: 'query', value: target.value }]
                            : target.classList.contains('label-control')
                              ? [{ kind: 'label', value: target.value }]
                              : target.classList.contains('value-control')
                                ? [{ kind: 'value', value: target.valueAsNumber }]
                                : []
                        : [],
                ),
            ),
            fromElementEvent$(frame, 'change').pipe(
                mergeMap(({ target }): BookChange[] =>
                    target instanceof HksSelect
                        ? target.classList.contains('variant')
                            ? [{ kind: 'variant', value: target.value }]
                            : target.classList.contains('appearance')
                              ? [{ kind: 'appearance', value: target.value }]
                              : target.classList.contains('width')
                                ? [{ kind: 'width', value: target.value }]
                                : []
                        : target instanceof HTMLInputElement &&
                            target.classList.contains('disabled-control')
                          ? [{ kind: 'disabled', value: target.checked }]
                          : [],
                ),
            ),
            fromElementEvent$(frame, 'click').pipe(
                mergeMap(({ target }): BookChange[] => {
                    const button = target instanceof Element ? target.closest('button') : null;
                    if (!(button instanceof HTMLButtonElement)) {
                        return [];
                    }
                    const story = button.dataset['story'];
                    const action = button.dataset['action'];
                    return story !== undefined
                        ? [{ kind: 'select', value: story }]
                        : action === 'reset' || action === 'action' || action === 'clear'
                          ? [{ kind: action }]
                          : [];
                }),
            ),
        ).pipe(share());
    }

    connect$(
        view$: Observable<BookView>,
        preview$: Observable<HTMLElement>,
        events$: Observable<readonly EventEntry[]>,
        variables$: Observable<ReadonlyMap<string, string>>,
    ): Observable<void> {
        const preview = requireChild(this.root, '.preview');
        return merge(
            this.rendering.lifetime$,
            this.preview.lifetime$,
            this.log.lifetime$,
            connectSelects$(this.root),
            view$.pipe(tap(view => this.rendering.update(view))),
            preview$.pipe(tap(element => this.preview.update(element))),
            events$.pipe(tap(entries => this.log.update(entries))),
            variables$.pipe(
                tap(variables => {
                    for (const [name, value] of variables) {
                        preview.style.setProperty(name, value);
                    }
                }),
            ),
        ).pipe(map(() => undefined));
    }
}
customElements.define('hks-storybook', HksStorybook);
