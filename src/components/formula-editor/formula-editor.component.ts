import { combineLatest, concat, merge, of, timer, type Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, share, switchMap, tap } from 'rxjs/operators';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-glsl.js';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import css from './formula-editor.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <p class="about"></p>
    <details class="guide">
        <summary>How formulas work</summary>
        <dl class="terms"></dl>
    </details>
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
    <pre class="error" role="alert" hidden></pre>
    <div class="foot">
        <div class="status" role="status" hidden>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 L10 17 L19 7"/></svg>
            <span>Compiled</span>
        </div>
        <select class="preset" aria-label="formula preset"></select>
        <details class="more">
            <summary class="toggle" aria-label="formula actions" title="save, share or delete">⋯</summary>
            <div class="menu">
                <form class="save">
                    <input class="name" type="text" placeholder="Name" aria-label="name for the copy" autocomplete="off" />
                    <button class="action" type="submit">Save as new</button>
                </form>
                <button class="action share" type="button">Copy share link</button>
                <button class="action delete" type="button">Delete this formula</button>
            </div>
        </details>
    </div>
`;

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
    readonly deletable$: Observable<boolean>;
    readonly copied$: Observable<string>;
};

const optionsKey = (options: readonly PresetOption[]): string =>
    options.map(({ value, label }) => `${value}\u0000${label}`).join('\u0001');

const COPIED_MS = 1600;

export class HksFormulaEditor extends HTMLElement {
    readonly changes$: Observable<string>;
    readonly selections$: Observable<string>;
    readonly saves$: Observable<string>;
    readonly shares$: Observable<void>;
    readonly deletes$: Observable<void>;

    private readonly source: HTMLTextAreaElement;
    private readonly picker: HTMLSelectElement;
    private readonly highlighted: HTMLElement;
    private readonly viewport: HTMLElement;
    private readonly error: HTMLElement;
    private readonly status: HTMLElement;
    private readonly gutter: HTMLElement;
    private readonly about: HTMLElement;
    private readonly terms: HTMLElement;
    private readonly typed$: Observable<string>;
    private readonly menu: HTMLDetailsElement;
    private readonly saveForm: HTMLFormElement;
    private readonly share: HTMLButtonElement;
    private readonly removal: HTMLButtonElement;
    private readonly submitted$: Observable<string>;

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
        this.about = requireChild(shadow, '.about');
        this.terms = requireChild(shadow, '.terms');

        this.typed$ = fromElementEvent$(this.source, 'input').pipe(map(() => this.source.value));
        this.changes$ = this.typed$.pipe(debounceTime(250), distinctUntilChanged());

        this.selections$ = fromElementEvent$(this.picker, 'change').pipe(
            map(() => this.picker.value),
        );

        this.menu = requireElement(shadow, '.more', HTMLDetailsElement);
        this.saveForm = requireElement(shadow, '.save', HTMLFormElement);
        this.share = requireElement(shadow, '.share', HTMLButtonElement);
        this.removal = requireElement(shadow, '.delete', HTMLButtonElement);
        const name = requireElement(shadow, '.name', HTMLInputElement);

        // One listener, shared: the name is read once, before connect$ clears the field.
        this.submitted$ = fromElementEvent$(this.saveForm, 'submit').pipe(
            map(event => {
                event.preventDefault();

                return name.value;
            }),
            share(),
        );
        this.saves$ = this.submitted$;
        this.shares$ = fromElementEvent$(this.share, 'click').pipe(map(() => undefined));
        this.deletes$ = fromElementEvent$(this.removal, 'click').pipe(map(() => undefined));
    }

    guide(entries: readonly GuideEntry[]): this {
        this.terms.replaceChildren(
            ...entries.flatMap(({ term, text }) => {
                const name = document.createElement('dt');
                const code = document.createElement('code');
                code.textContent = term;
                name.append(code);

                const meaning = document.createElement('dd');
                meaning.textContent = text;

                return [name, meaning];
            }),
        );

        return this;
    }

    connect$({
        options$,
        selected$,
        preset$,
        about$,
        error$,
        deletable$,
        copied$,
    }: FormulaEditorView): Observable<void> {
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
            // Together: options rebuilt after the value was set would drop the selection.
            combineLatest([options$, selected$]).pipe(
                tap(([options, value]) => {
                    const current = [...this.picker.options].map(({ value: v, label }) => ({
                        value: v,
                        label,
                    }));

                    if (optionsKey(current) !== optionsKey(options)) {
                        this.picker.replaceChildren(
                            ...options.map(option => new Option(option.label, option.value)),
                        );
                    }

                    this.picker.value = value;
                }),
            ),
            deletable$.pipe(
                distinctUntilChanged(),
                tap(deletable => {
                    this.removal.disabled = !deletable;
                }),
            ),
            merge(this.submitted$, this.shares$, this.deletes$).pipe(
                tap(() => {
                    this.saveForm.reset();
                }),
            ),
            merge(this.submitted$, this.deletes$).pipe(
                tap(() => {
                    this.menu.open = false;
                }),
            ),
            copied$.pipe(
                tap(link => {
                    void navigator.clipboard?.writeText(link).catch(() => undefined);
                }),
                switchMap(() => concat(of(true), timer(COPIED_MS).pipe(map(() => false)))),
                tap(copied => {
                    this.share.textContent = copied ? 'Link copied' : 'Copy share link';
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
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-formula-editor', HksFormulaEditor);
