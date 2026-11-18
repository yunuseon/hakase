import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';

import { renderOptions, type SelectChoice } from '../../shared/select/options.component.ts';
import { mountView, renderView, type RenderView, type Rendering } from '../../lib/lit.ts';
import { HksSelect, connectSelects$ } from '../../shared/select/select.component.ts';
import { combineLatest, merge, type Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, tap } from 'rxjs/operators';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-glsl.js';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import css from './formula-editor.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = () =>
    html`<p class="about" data-detail></p>
        <details class="guide" data-detail>
            <summary>How formulas work</summary>
            <dl class="terms"></dl>
        </details>
        <div class="editor">
            <pre class="highlight" aria-hidden="true" data-scrolls><code></code></pre>
            <pre class="gutter" aria-hidden="true" data-scrolls></pre>
            <textarea
                class="ui-field source"
                data-scrolls
                spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
                aria-label="formula source"
            ></textarea>
        </div>
        <pre class="error" role="alert" hidden></pre>
        <div class="foot" data-detail>
            <div class="status" role="status" hidden>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 12.5 L10 17 L19 7"></path></svg
                ><span>Compiled</span>
            </div>
            <hks-select class="ui-field preset" aria-label="formula preset"></hks-select>
        </div>`;

const grammar = Prism.languages['glsl'];
if (!grammar) {
    throw new Error('Prism loaded without its GLSL grammar');
}

// Without the trailing newline the <pre> lays out one line short of the caret.
const highlight = (source: string): string => Prism.highlight(`${source}\n`, grammar, 'glsl');

const lineNumbers = (source: string): string =>
    Array.from({ length: source.split('\n').length }, (_, index) => String(index + 1)).join('\n');

export type GuideEntry = {
    readonly term: string;
    readonly text: string;
};

export type PresetOption = {
    readonly value: string;
    readonly label: string;
};

export type FormulaEditorView = {
    readonly options$: Observable<readonly PresetOption[]>;
    readonly selected$: Observable<string>;
    readonly preset$: Observable<string>;
    readonly about$: Observable<string>;
    readonly error$: Observable<string | null>;
};

export class HksFormulaEditor extends HTMLElement {
    readonly changes$: Observable<string>;
    readonly selections$: Observable<string>;

    private readonly source: HTMLTextAreaElement;
    private readonly picker: HksSelect;
    private readonly highlighted: HTMLElement;
    private readonly viewport: HTMLElement;
    private readonly error: HTMLElement;
    private readonly status: HTMLElement;
    private readonly gutter: HTMLElement;
    private readonly about: HTMLElement;
    private readonly terms: HTMLElement;
    private readonly typed$: Observable<string>;

    private readonly shadow: ShadowRoot;

    private readonly rendering: Rendering;

    private readonly guideView: RenderView<readonly GuideEntry[]>;
    private readonly optionsView: RenderView<readonly SelectChoice[]>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());

        this.source = requireElement(shadow, '.source', HTMLTextAreaElement);
        this.picker = requireElement(shadow, '.preset', HksSelect);
        this.optionsView = renderOptions(this.picker);
        this.viewport = requireChild(shadow, '.highlight');
        this.highlighted = requireChild(this.viewport, 'code');
        this.error = requireChild(shadow, '.error');
        this.status = requireChild(shadow, '.status');
        this.gutter = requireChild(shadow, '.gutter');
        this.about = requireChild(shadow, '.about');
        this.terms = requireChild(shadow, '.terms');
        this.guideView = renderView<readonly GuideEntry[]>(this.terms, [], entries =>
            repeat(
                entries,
                item => item,
                entry =>
                    html`<dt><code>${entry.term}</code></dt>
                        <dd>${entry.text}</dd>`,
            ),
        );

        this.typed$ = fromElementEvent$(this.source, 'input').pipe(map(() => this.source.value));
        this.changes$ = this.typed$.pipe(debounceTime(250), distinctUntilChanged());

        this.selections$ = fromElementEvent$(this.picker, 'change').pipe(
            map(() => this.picker.value),
        );
    }

    guide(entries: readonly GuideEntry[]): this {
        this.guideView.update(entries);

        return this;
    }

    connect$({
        options$,
        selected$,
        preset$,
        about$,
        error$,
    }: FormulaEditorView): Observable<void> {
        // Presets only: echoing typing back would reset the caret every keystroke.
        // Not deduplicated: an undo can bring back the very text applied last, after the user typed over it.
        const applied$ = preset$.pipe(
            map(text => text.trim()),
            tap(text => {
                this.source.value = text;
            }),
        );

        const text$ = merge(applied$, this.typed$);

        return merge(
            this.rendering.lifetime$,
            this.optionsView.lifetime$,
            this.guideView.lifetime$,
            merge(
                connectSelects$(this.shadow),
                // Together: options rebuilt after the value was set would drop the selection.
                combineLatest([options$, selected$]).pipe(
                    tap(([options, value]) => {
                        this.optionsView.update(options);
                        this.picker.value = value;
                    }),
                ),
                text$.pipe(
                    map(highlight),
                    tap(html => {
                        this.highlighted.innerHTML = html;
                    }),
                ),
                text$.pipe(
                    map(lineNumbers),
                    distinctUntilChanged(),
                    tap(numbers => {
                        this.gutter.textContent = numbers;
                    }),
                ),
                fromElementEvent$(this.source, 'scroll').pipe(
                    tap(() => {
                        this.viewport.scrollTo(this.source.scrollLeft, this.source.scrollTop);
                        this.gutter.scrollTop = this.source.scrollTop;
                    }),
                ),
                about$.pipe(
                    distinctUntilChanged(),
                    tap(text => {
                        this.about.textContent = text;
                    }),
                ),
                error$.pipe(
                    distinctUntilChanged(),
                    tap(message => {
                        this.error.textContent = message ?? '';
                        this.error.hidden = message === null;
                        this.status.hidden = message !== null;
                    }),
                ),
            ).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-formula-editor', HksFormulaEditor);
