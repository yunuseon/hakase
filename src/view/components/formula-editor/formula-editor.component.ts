import { combineLatest, merge, type Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, tap } from 'rxjs/operators';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-glsl.js';
import { requireChild, styleSheet } from '../../../lib/dom.ts';
import windowCss from '../window.css?inline';
import type { Frame, LayoutAction } from '../../../model/layout.ts';
import { dockLabel } from '../../../model/terminal.ts';
import type { TerminalState } from '../../../model/terminal.ts';
import { frameActions$, place, size } from '../window-frame.ts';
import { fromElementEvent$ } from '../../../lib/rx.ts';
import css from './formula-editor.css?inline';

const chrome = styleSheet(windowCss);
const sheet = styleSheet(css);

const TEMPLATE = `
    <div class="title">
        <span>formula</span>
        <span class="meta">
            <span class="hint hint--docked">alt+t show &middot; esc close &middot; </span><span class="hint dock-key"></span>
            <button type="button" class="dock">undock</button>
        </span>
    </div>
    <div class="body">
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
    </div>
`;

const sameTerminal = (a: TerminalState, b: TerminalState): boolean =>
    a.style === b.style && a.open === b.open;

const grammar = Prism.languages['glsl'];
if (!grammar) {
    throw new Error('Prism loaded without its GLSL grammar');
}

// Without the trailing newline the <pre> lays out one line short of the caret.
const highlight = (source: string): string => Prism.highlight(`${source}\n`, grammar, 'glsl');

export class HksFormulaEditor extends HTMLElement {
    readonly changes$: Observable<string>;
    readonly frame$: Observable<LayoutAction>;
    readonly styleToggles$: Observable<void>;

    private readonly dock: HTMLElement;
    private readonly dockKey: HTMLElement;

    private readonly source: HTMLTextAreaElement;
    private readonly highlighted: HTMLElement;
    private readonly viewport: HTMLElement;
    private readonly error: HTMLElement;
    private readonly typed$: Observable<string>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [chrome, sheet];
        shadow.innerHTML = TEMPLATE;

        const source = requireChild(shadow, '.source');
        if (!(source instanceof HTMLTextAreaElement)) {
            throw new Error('The formula editor template must contain a <textarea>');
        }

        this.source = source;
        this.viewport = requireChild(shadow, '.highlight');
        this.highlighted = requireChild(this.viewport, 'code');
        this.error = requireChild(shadow, '.error');
        this.dock = requireChild(shadow, '.dock');
        this.dockKey = requireChild(shadow, '.dock-key');

        // The button sits inside the drag handle; its press must not also drag.
        this.styleToggles$ = fromElementEvent$(this.dock, 'pointerdown').pipe(
            tap(event => {
                event.stopPropagation();
            }),
            map(() => undefined),
        );

        this.frame$ = frameActions$(this, shadow, 'terminal');

        this.typed$ = fromElementEvent$(this.source, 'input').pipe(map(() => this.source.value));
        this.changes$ = this.typed$.pipe(debounceTime(250), distinctUntilChanged());
    }

    connect$(
        preset$: Observable<string>,
        error$: Observable<string | null>,
        terminal$: Observable<TerminalState>,
        frame$: Observable<Frame>,
    ): Observable<void> {
        // Presets only: echoing typing back would reset the caret every keystroke.
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
            terminal$.pipe(
                distinctUntilChanged(sameTerminal),
                tap(state => {
                    const { style, open } = state;
                    const label = dockLabel(state);
                    this.dock.textContent = label;
                    this.dockKey.textContent = `alt+d ${label}`;
                    this.dataset['style'] = style;
                    this.toggleAttribute('open', open);

                    if (!open) {
                        this.source.blur();
                    }
                }),
            ),
            // Docked is positioned by CSS; an inline transform strands it mid-slide.
            combineLatest([terminal$, frame$]).pipe(
                tap(([{ style }, frame]) => {
                    if (style === 'floating') {
                        place(this, frame);
                        size(this, frame);
                        return;
                    }

                    this.style.removeProperty('transform');
                    this.style.removeProperty('width');
                    this.style.removeProperty('height');
                    this.style.removeProperty('z-index');
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-formula-editor', HksFormulaEditor);
