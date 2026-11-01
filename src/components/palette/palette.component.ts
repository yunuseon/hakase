import { combineLatest, EMPTY, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, filter, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import { matches, sameCommands, type Command } from './palette.ts';
import css from './palette.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <div class="scrim"></div>
    <div class="panel" role="dialog" aria-label="command palette">
        <input class="query" type="text" placeholder="Type a command" aria-label="command"
               autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="results" />
        <ul class="results" id="results" role="listbox"></ul>
        <p class="empty">No command matches.</p>
    </div>
`;

const rowOf = ({ id, label, hint }: Command, index: number): HTMLElement => {
    const row = document.createElement('li');
    row.className = 'row';
    row.id = `command-${index}`;
    row.dataset['command'] = id;
    row.setAttribute('role', 'option');

    const name = document.createElement('span');
    name.className = 'label';
    name.textContent = label;

    const kind = document.createElement('span');
    kind.className = 'hint';
    kind.textContent = hint;

    row.append(name, kind);

    return row;
};

export class HksPalette extends HTMLElement {
    readonly opens$: Observable<void>;
    readonly closes$: Observable<void>;
    readonly picks$: Observable<string>;

    private readonly query: HTMLInputElement;
    private readonly results: HTMLElement;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.query = requireElement(shadow, '.query', HTMLInputElement);
        this.results = requireChild(shadow, '.results');

        // Anywhere, even inside a text field: ⌘K is the palette's own, and no field uses it.
        this.opens$ = fromDocumentEvent$('keydown').pipe(
            filter(event => (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'),
            tap(event => {
                event.preventDefault();
            }),
            map(() => undefined),
        );

        this.closes$ = merge(
            fromElementEvent$(requireChild(shadow, '.scrim'), 'click'),
            fromElementEvent$(this.query, 'keydown').pipe(filter(({ key }) => key === 'Escape')),
        ).pipe(map(() => undefined));

        this.picks$ = merge(
            fromElementEvent$(this.results, 'click').pipe(
                mergeMap(({ target }) => {
                    const row = target instanceof Element ? target.closest('[data-command]') : null;
                    const id = row instanceof HTMLElement ? row.dataset['command'] : undefined;

                    return id === undefined ? EMPTY : of(id);
                }),
            ),
            fromElementEvent$(this.query, 'keydown').pipe(
                filter(({ key }) => key === 'Enter'),
                mergeMap(() => {
                    const id = this.active()?.dataset['command'];

                    return id === undefined ? EMPTY : of(id);
                }),
            ),
        );
    }

    private rows(): HTMLElement[] {
        return [...this.results.children].filter(row => row instanceof HTMLElement);
    }

    private active(): HTMLElement | undefined {
        return this.rows().find(row => row.hasAttribute('data-active'));
    }

    private activate(row: HTMLElement | undefined): void {
        for (const each of this.rows()) {
            each.toggleAttribute('data-active', each === row);
        }

        if (row === undefined) {
            this.query.removeAttribute('aria-activedescendant');

            return;
        }

        this.query.setAttribute('aria-activedescendant', row.id);
        row.scrollIntoView({ block: 'nearest' });
    }

    // The query and the highlighted row are this view's own: what is typed is not app state.
    connect$(
        commands$: Observable<readonly Command[]>,
        open$: Observable<boolean>,
    ): Observable<void> {
        const shown$ = open$.pipe(
            distinctUntilChanged(),
            tap(open => {
                this.toggleAttribute('data-open', open);

                if (open) {
                    this.query.value = '';
                    this.query.focus();
                } else {
                    this.query.blur();
                }
            }),
        );

        // Read from the field on every keystroke and on opening, after shown$ has emptied it.
        const query$ = merge(fromElementEvent$(this.query, 'input'), open$).pipe(
            map(() => this.query.value),
        );

        const filtered$ = combineLatest([
            commands$.pipe(distinctUntilChanged(sameCommands)),
            query$,
        ]).pipe(
            map(([commands, query]) => matches(commands, query)),
            tap(shown => {
                this.results.replaceChildren(...shown.map(rowOf));
                this.activate(this.rows()[0]);
            }),
        );

        const moved$ = fromElementEvent$(this.query, 'keydown').pipe(
            filter(({ key }) => key === 'ArrowDown' || key === 'ArrowUp'),
            tap(event => {
                event.preventDefault();
                const rows = this.rows();
                const index = rows.findIndex(row => row.hasAttribute('data-active'));
                const step = event.key === 'ArrowDown' ? 1 : -1;
                this.activate(rows[(index + step + rows.length) % Math.max(rows.length, 1)]);
            }),
        );

        return merge(shown$, filtered$, moved$).pipe(map(() => undefined));
    }
}

customElements.define('hks-palette', HksPalette);
