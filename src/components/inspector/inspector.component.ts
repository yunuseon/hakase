import { combineLatest, concat, EMPTY, merge, of, timer, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    scan,
    share,
    startWith,
    switchMap,
    tap,
} from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import type { Row } from './inspector.ts';
import css from './inspector.css?inline';

const sheet = styleSheet(css);

const COPIED_MS = 1500;
const ARM_MS = 3000;

type Arming = {
    readonly armed: number | null;
    readonly fire: boolean;
};

const TEMPLATE = `
    <div class="side">
        <nav class="tree" aria-label="state"></nav>
        <button class="prune" type="button"></button>
    </div>
    <section class="viewer">
        <header class="head">
            <span class="heading"></span>
            <button class="copy" type="button">Copy JSON</button>
        </header>
        <div class="rows" role="tree"></div>
        <p class="empty">Pick a state on the left.</p>
    </section>
`;

export type TreeItem = {
    readonly id: string;
    readonly label: string;
    readonly colour: string | null;
    readonly users: number | null;
};

export type TreeGroup = {
    readonly title: string;
    readonly items: readonly TreeItem[];
};

export type InspectorView = {
    readonly tree$: Observable<readonly TreeGroup[]>;
    readonly selected$: Observable<string | null>;
    readonly heading$: Observable<string>;
    readonly rows$: Observable<readonly Row[]>;
    readonly copied$: Observable<string>;
    readonly unused$: Observable<number>;
};

const dataOf = (target: EventTarget | null, key: string): string | undefined => {
    const element = target instanceof Element ? target.closest(`[data-${key}]`) : null;

    return element instanceof HTMLElement ? element.dataset[key] : undefined;
};

const usersText = (users: number | null): string =>
    users === null ? '' : users === 0 ? 'unused' : users === 1 ? '1 window' : `${users} windows`;

const groupOf = ({ title, items }: TreeGroup): HTMLElement => {
    const group = document.createElement('div');
    group.className = 'group';

    const heading = document.createElement('p');
    heading.className = 'group-title';
    heading.textContent = title;
    group.append(heading);

    for (const { id, label, colour, users } of items) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'item';
        item.dataset['select'] = id;

        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.toggleAttribute('data-none', colour === null);

        if (colour !== null) {
            dot.style.setProperty('--store', colour);
        }

        const name = document.createElement('span');
        name.className = 'label';
        name.textContent = label;

        const count = document.createElement('span');
        count.className = 'users';
        count.textContent = usersText(users);

        item.append(dot, name, count);
        group.append(item);
    }

    return group;
};

const rowOf = (path: string): HTMLElement => {
    const row = document.createElement('div');
    row.className = 'row';
    row.dataset['path'] = path;
    row.setAttribute('role', 'treeitem');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'toggle';
    toggle.dataset['toggle'] = path;

    const key = document.createElement('span');
    key.className = 'key';

    const value = document.createElement('span');
    value.className = 'value';

    row.append(toggle, key, value);

    return row;
};

const filled = (row: HTMLElement, { depth, key, kind, text, open }: Row): void => {
    const container = kind === 'object' || kind === 'array';
    row.style.setProperty('--depth', String(depth));
    row.dataset['kind'] = kind;
    row.toggleAttribute('data-open', open);

    if (container) {
        row.setAttribute('aria-expanded', String(open));
    } else {
        row.removeAttribute('aria-expanded');
    }

    const toggle = row.querySelector('.toggle');
    const name = row.querySelector('.key');
    const value = row.querySelector('.value');

    if (toggle instanceof HTMLButtonElement) {
        toggle.hidden = !container;
        toggle.setAttribute('aria-label', open ? `collapse ${key}` : `expand ${key}`);
    }

    if (name !== null && name.textContent !== key) {
        name.textContent = key;
    }

    if (value !== null && value.textContent !== text) {
        value.textContent = text;
    }
};

export class HksInspector extends HTMLElement {
    readonly selections$: Observable<string>;
    readonly toggles$: Observable<string>;
    readonly copies$: Observable<void>;
    readonly prunes$: Observable<void>;

    private readonly shadow: ShadowRoot;
    private readonly arming$: Observable<Arming>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.selections$ = fromElementEvent$(requireChild(shadow, '.tree'), 'click').pipe(
            mergeMap(({ target }) => {
                const id = dataOf(target, 'select');

                return id === undefined ? EMPTY : of(id);
            }),
        );
        this.toggles$ = fromElementEvent$(requireChild(shadow, '.rows'), 'click').pipe(
            mergeMap(({ target }) => {
                const row = target instanceof Element ? target.closest('.row') : null;
                const path = row instanceof HTMLElement ? row.dataset['path'] : undefined;

                return path === undefined || row?.querySelector('.toggle[hidden]') !== null
                    ? EMPTY
                    : of(path);
            }),
        );
        this.copies$ = fromElementEvent$(requireChild(shadow, '.copy'), 'click').pipe(
            map(() => undefined),
        );

        // Shared: the button's label and the prune itself must read one sequence of clicks.
        this.arming$ = fromElementEvent$(requireChild(shadow, '.prune'), 'click').pipe(
            scan(
                ({ armed }: Arming, { timeStamp }): Arming =>
                    armed !== null && timeStamp - armed < ARM_MS
                        ? { armed: null, fire: true }
                        : { armed: timeStamp, fire: false },
                { armed: null, fire: false },
            ),
            share(),
        );
        this.prunes$ = this.arming$.pipe(
            filter(({ fire }) => fire),
            map(() => undefined),
        );
    }

    connect$({
        tree$,
        selected$,
        heading$,
        rows$,
        copied$,
        unused$,
    }: InspectorView): Observable<void> {
        const shadow = this.shadow;
        const tree = requireChild(shadow, '.tree');
        const rows = requireChild(shadow, '.rows');
        const heading = requireChild(shadow, '.heading');
        const copy = requireChild(shadow, '.copy');
        const prune = requireElement(shadow, '.prune', HTMLButtonElement);

        return merge(
            combineLatest([
                unused$.pipe(distinctUntilChanged()),
                this.arming$.pipe(
                    switchMap(({ armed }) =>
                        armed === null
                            ? of(false)
                            : concat(of(true), timer(ARM_MS).pipe(map(() => false))),
                    ),
                    startWith(false),
                ),
            ]).pipe(
                tap(([count, armed]) => {
                    const states = count === 1 ? '1 unused state' : `${count} unused states`;
                    prune.disabled = count === 0;
                    prune.toggleAttribute('data-armed', armed && count > 0);
                    prune.textContent =
                        count === 0
                            ? 'Nothing to prune'
                            : armed
                              ? `Delete ${states}?`
                              : `Prune ${states}`;
                    prune.title =
                        count === 0 ? '' : 'deletes every state no window uses, with its data';
                }),
            ),
            tree$.pipe(
                tap(groups => {
                    tree.replaceChildren(...groups.map(groupOf));
                }),
                switchMap(() => selected$),
                tap(selected => {
                    for (const item of tree.querySelectorAll('.item')) {
                        if (item instanceof HTMLElement) {
                            item.toggleAttribute(
                                'data-selected',
                                item.dataset['select'] === selected,
                            );
                        }
                    }

                    this.toggleAttribute('data-empty', selected === null);
                }),
            ),
            heading$.pipe(
                distinctUntilChanged(),
                tap(text => {
                    heading.textContent = text;
                }),
            ),
            rows$.pipe(
                tap(list => {
                    const existing = new Map(
                        [...rows.children]
                            .filter(child => child instanceof HTMLElement)
                            .map(child => [child.dataset['path'], child]),
                    );
                    const shown = list.map(row => {
                        const element = existing.get(row.path) ?? rowOf(row.path);
                        filled(element, row);

                        return element;
                    });
                    const current = [...rows.children];

                    // Only when the rows differ: values update in place, so a live state does not flicker.
                    if (
                        current.length !== shown.length ||
                        shown.some((row, index) => current[index] !== row)
                    ) {
                        rows.replaceChildren(...shown);
                    }
                }),
            ),
            copied$.pipe(
                tap(text => {
                    void navigator.clipboard?.writeText(text).catch(() => undefined);
                }),
                switchMap(() => concat(of(true), timer(COPIED_MS).pipe(map(() => false)))),
                tap(copied => {
                    copy.textContent = copied ? 'Copied' : 'Copy JSON';
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-inspector', HksInspector);
