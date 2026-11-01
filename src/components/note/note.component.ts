import { combineLatest, concat, merge, of, timer, type Observable } from 'rxjs';
import { distinctUntilChanged, filter, map, scan, share, switchMap, tap } from 'rxjs/operators';
import { requireElement, requireChild, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import css from './note.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <header class="bar">
        <select class="pick" aria-label="note"></select>
        <button class="new" type="button" title="new note" aria-label="new note">+</button>
        <button class="delete" type="button">Delete</button>
    </header>
    <textarea class="body" placeholder="Write something…" aria-label="note text" spellcheck="true"></textarea>
    <div class="empty">
        <p>No notes yet.</p>
        <button class="first" type="button">New note</button>
    </div>
    <footer class="foot"><span class="count"></span></footer>
`;

const ARM_MS = 3000;

export type NoteOption = {
    readonly value: string;
    readonly label: string;
};

export type NoteView = {
    readonly options$: Observable<readonly NoteOption[]>;
    readonly selected$: Observable<string | null>;
    readonly text$: Observable<string>;
    readonly count$: Observable<string>;
};

type Arming = {
    readonly armed: number | null;
    readonly fire: boolean;
};

export class HksNote extends HTMLElement {
    readonly selections$: Observable<string>;
    readonly creates$: Observable<void>;
    readonly edits$: Observable<string>;
    readonly removes$: Observable<void>;

    private readonly picker: HTMLSelectElement;
    private readonly body: HTMLTextAreaElement;
    private readonly deleter: HTMLButtonElement;
    private readonly count: HTMLElement;
    private readonly arming$: Observable<Arming>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.picker = requireElement(shadow, '.pick', HTMLSelectElement);
        this.body = requireElement(shadow, '.body', HTMLTextAreaElement);
        this.deleter = requireElement(shadow, '.delete', HTMLButtonElement);
        this.count = requireChild(shadow, '.count');

        this.selections$ = fromElementEvent$(this.picker, 'change').pipe(
            map(() => this.picker.value),
        );
        this.creates$ = merge(
            fromElementEvent$(requireChild(shadow, '.new'), 'click'),
            fromElementEvent$(requireChild(shadow, '.first'), 'click'),
        ).pipe(map(() => undefined));
        this.edits$ = fromElementEvent$(this.body, 'input').pipe(map(() => this.body.value));

        // Shared: the button's label and the removal must read one sequence of clicks.
        this.arming$ = fromElementEvent$(this.deleter, 'click').pipe(
            scan(
                ({ armed }: Arming, { timeStamp }): Arming =>
                    armed !== null && timeStamp - armed < ARM_MS
                        ? { armed: null, fire: true }
                        : { armed: timeStamp, fire: false },
                { armed: null, fire: false },
            ),
            share(),
        );
        this.removes$ = this.arming$.pipe(
            filter(({ fire }) => fire),
            map(() => undefined),
        );
    }

    connect$({ options$, selected$, text$, count$ }: NoteView): Observable<void> {
        return merge(
            combineLatest([options$, selected$]).pipe(
                tap(([options, selected]) => {
                    this.picker.replaceChildren(
                        ...options.map(({ value, label }) => new Option(label, value)),
                    );
                    this.picker.value = selected ?? '';
                    this.toggleAttribute('data-empty', selected === null);
                }),
            ),
            text$.pipe(
                tap(text => {
                    // Only when it differs: writing the textarea's own text back resets the caret.
                    if (this.body.value !== text) {
                        this.body.value = text;
                    }
                }),
            ),
            count$.pipe(
                distinctUntilChanged(),
                tap(count => {
                    this.count.textContent = count;
                }),
            ),
            this.arming$.pipe(
                switchMap(({ armed }) =>
                    armed === null
                        ? of(false)
                        : concat(of(true), timer(ARM_MS).pipe(map(() => false))),
                ),
                tap(armed => {
                    this.deleter.toggleAttribute('data-armed', armed);
                    this.deleter.textContent = armed ? 'Delete?' : 'Delete';
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-note', HksNote);
