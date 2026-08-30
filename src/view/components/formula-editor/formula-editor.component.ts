import { merge, type Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, tap } from 'rxjs/operators';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-glsl.js';
import { requireChild, styleSheet } from '../../../lib/dom.ts';
import { fromElementEvent$ } from '../../../lib/rx.ts';
import css from './formula-editor.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <span class="label">formula</span>
    <div class="editor">
        <pre class="highlight" aria-hidden="true"><code></code></pre>
        <textarea
            class="source"
            spellcheck="false"
            autocomplete="off"
            autocapitalize="off"
            aria-label="formula source"
        ></textarea>
    </div>
    <pre class="error" hidden></pre>
`;

const grammar = Prism.languages['glsl'];
if (!grammar) {
    throw new Error('Prism loaded without its GLSL grammar');
}

// The trailing newline has no glyphs for the <pre> to lay out, so without this
// the last line of the highlight layer sits one row above the caret.
const highlight = (source: string): string => Prism.highlight(`${source}\n`, grammar, 'glsl');

export class HksFormulaEditor extends HTMLElement {
    readonly changes$: Observable<string>;

    private readonly source: HTMLTextAreaElement;
    private readonly highlighted: HTMLElement;
    private readonly viewport: HTMLElement;
    private readonly error: HTMLElement;
    private readonly typed$: Observable<string>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        const source = requireChild(shadow, '.source');
        if (!(source instanceof HTMLTextAreaElement)) {
            throw new Error('The formula editor template must contain a <textarea>');
        }

        this.source = source;
        this.viewport = requireChild(shadow, '.highlight');
        this.highlighted = requireChild(this.viewport, 'code');
        this.error = requireChild(shadow, '.error');

        this.typed$ = fromElementEvent$(this.source, 'input').pipe(map(() => this.source.value));
        this.changes$ = this.typed$.pipe(debounceTime(250), distinctUntilChanged());
    }

    connect$(preset$: Observable<string>, error$: Observable<string | null>): Observable<void> {
        // Only presets are written back. Echoing the user's own typing into the
        // textarea would reset the caret on every keystroke.
        const applied$ = preset$.pipe(
            distinctUntilChanged(),
            map(text => text.trim()),
            tap(text => {
                this.source.value = text;
            }),
        );

        return merge(
            merge(applied$, this.typed$).pipe(
                map(highlight),
                tap(html => {
                    this.highlighted.innerHTML = html;
                }),
            ),
            fromElementEvent$(this.source, 'scroll').pipe(
                tap(() => {
                    this.viewport.scrollTo(this.source.scrollLeft, this.source.scrollTop);
                }),
            ),
            error$.pipe(
                distinctUntilChanged(),
                tap(message => {
                    this.error.textContent = message ?? '';
                    this.error.hidden = message === null;
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-formula-editor', HksFormulaEditor);
