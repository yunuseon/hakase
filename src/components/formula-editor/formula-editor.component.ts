import { concat, defer, merge, of, type Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, tap } from 'rxjs/operators';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-glsl.js';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import css from './formula-editor.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <div class="bar">
        <select class="preset" aria-label="formula preset"></select>
    </div>
    <div class="editor">
        <pre class="highlight" aria-hidden="true"><code></code></pre>
        <pre class="gutter" aria-hidden="true"></pre>
        <textarea
            class="source"
            spellcheck="false"
            autocomplete="off"
            autocapitalize="off"
            aria-label="formula source"
        ></textarea>
    </div>
    <div class="status" role="status" hidden>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 L10 17 L19 7"/></svg>
        <span>Compiled</span>
    </div>
    <pre class="error" role="alert" hidden></pre>
`;

const grammar = Prism.languages['glsl'];
if (!grammar) {
    throw new Error('Prism loaded without its GLSL grammar');
}

// Without the trailing newline the <pre> lays out one line short of the caret.
const highlight = (source: string): string => Prism.highlight(`${source}\n`, grammar, 'glsl');

const lineNumbers = (source: string): string =>
    Array.from({ length: source.split('\n').length }, (_, index) => String(index + 1)).join('\n');

export type PresetOption = {
    readonly value: string;
    readonly label: string;
};

export class HksFormulaEditor extends HTMLElement {
    readonly changes$: Observable<string>;
    readonly selections$: Observable<string>;

    private readonly source: HTMLTextAreaElement;
    private readonly picker: HTMLSelectElement;
    private readonly highlighted: HTMLElement;
    private readonly viewport: HTMLElement;
    private readonly error: HTMLElement;
    private readonly status: HTMLElement;
    private readonly gutter: HTMLElement;
    private readonly typed$: Observable<string>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.source = requireElement(shadow, '.source', HTMLTextAreaElement);
        this.picker = requireElement(shadow, '.preset', HTMLSelectElement);
        this.viewport = requireChild(shadow, '.highlight');
        this.highlighted = requireChild(this.viewport, 'code');
        this.error = requireChild(shadow, '.error');
        this.status = requireChild(shadow, '.status');
        this.gutter = requireChild(shadow, '.gutter');

        this.typed$ = fromElementEvent$(this.source, 'input').pipe(map(() => this.source.value));
        this.changes$ = this.typed$.pipe(debounceTime(250), distinctUntilChanged());

        // Deferred: the current option is only known once presets() has filled the list.
        this.selections$ = defer(() =>
            concat(
                of(this.picker.value),
                fromElementEvent$(this.picker, 'change').pipe(map(() => this.picker.value)),
            ),
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

    connect$(preset$: Observable<string>, error$: Observable<string | null>): Observable<void> {
        // Presets only: echoing typing back would reset the caret every keystroke.
        const applied$ = preset$.pipe(
            distinctUntilChanged(),
            map(text => text.trim()),
            tap(text => {
                this.source.value = text;
            }),
        );

        const text$ = merge(applied$, this.typed$);

        return merge(
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
            error$.pipe(
                distinctUntilChanged(),
                tap(message => {
                    this.error.textContent = message ?? '';
                    this.error.hidden = message === null;
                    this.status.hidden = message !== null;
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-formula-editor', HksFormulaEditor);
