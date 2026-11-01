import { EMPTY, merge, of, type Observable } from 'rxjs';
import { filter, map, mergeMap, share, startWith, switchMap, takeWhile, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import { addable, hostOf, type Link, type LinkCommand } from './links.ts';
import css from './links.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <ul class="items" aria-label="links"></ul>
    <p class="empty">Paste an address below, optionally after a name.</p>
    <form class="add">
        <input class="draft" type="text" placeholder="Name https://…" aria-label="new link" autocomplete="off" />
        <button class="submit" type="submit">Add</button>
    </form>
`;

const ENDS = ['pointerup', 'pointercancel'] as const;

type Drag = {
    readonly id: string;
    readonly to: number;
    readonly phase: 'moving' | 'dropped' | 'cancelled';
};

const dataOf = (target: EventTarget | null, key: string): string | undefined => {
    const element = target instanceof Element ? target.closest(`[data-${key}]`) : null;

    return element instanceof HTMLElement ? element.dataset[key] : undefined;
};

const button = (
    className: string,
    key: string,
    id: string,
    text: string,
    label: string,
): HTMLButtonElement => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.dataset[key] = id;
    element.textContent = text;
    element.setAttribute('aria-label', label);

    return element;
};

const itemOf = (id: string): HTMLElement => {
    const item = document.createElement('li');
    item.className = 'item';
    item.dataset['id'] = id;

    const grip = button('grip', 'grip', id, '', 'move link; arrow keys reorder');

    const badge = document.createElement('span');
    badge.className = 'badge';

    const anchor = document.createElement('a');
    anchor.className = 'link';
    anchor.target = '_blank';
    // Not just target: without noopener the opened page can navigate this one.
    anchor.rel = 'noopener noreferrer';
    anchor.innerHTML = '<span class="title"></span><span class="host"></span>';

    const title = document.createElement('input');
    title.className = 'rename';
    title.dataset['rename'] = id;
    title.autocomplete = 'off';
    title.setAttribute('aria-label', 'link name');

    const edit = button('edit', 'edit', id, '✎', 'rename link');
    const remove = button('remove', 'remove', id, '×', 'delete link');

    item.append(grip, badge, anchor, title, edit, remove);

    return item;
};

const filled = (item: HTMLElement, { url, title }: Link, active: Element | null): void => {
    const anchor = item.querySelector('.link');
    const input = item.querySelector('.rename');
    const host = hostOf(url);

    if (anchor instanceof HTMLAnchorElement) {
        anchor.href = url;
        anchor.title = url;
        const name = anchor.querySelector('.title');
        const shown = anchor.querySelector('.host');

        if (name !== null) {
            name.textContent = title;
        }

        if (shown !== null) {
            shown.textContent = title === host ? '' : host;
        }
    }

    const badge = item.querySelector('.badge');

    if (badge !== null) {
        badge.textContent = (host[0] ?? '?').toUpperCase();
    }

    // Not while focused: that would overwrite a name being typed with another window's edit.
    if (input instanceof HTMLInputElement && input !== active) {
        input.value = title;
    }
};

export class HksLinks extends HTMLElement {
    readonly commands$: Observable<LinkCommand>;

    private readonly shadow: ShadowRoot;
    private readonly submitted$: Observable<string>;
    private readonly drags$: Observable<Drag>;
    private readonly editing$: Observable<string | null>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        const items = requireChild(shadow, '.items');
        const form = requireElement(shadow, '.add', HTMLFormElement);
        const draft = requireElement(shadow, '.draft', HTMLInputElement);

        // One listener, shared: the draft is read once, before anyone clears it.
        this.submitted$ = fromElementEvent$(form, 'submit').pipe(
            map(event => {
                // Not a page navigation: the form exists for Enter, not to be sent anywhere.
                event.preventDefault();

                return draft.value;
            }),
            share(),
        );

        this.editing$ = merge(
            fromElementEvent$(items, 'click').pipe(
                mergeMap(({ target }) => {
                    const id = dataOf(target, 'edit');

                    return id === undefined ? EMPTY : of(id);
                }),
            ),
            fromElementEvent$(items, 'focusout').pipe(
                filter(({ target }) => target instanceof HTMLInputElement),
                map(() => null),
            ),
        ).pipe(share());

        const middlesExcept = (id: string): readonly number[] =>
            [...items.children].flatMap(row => {
                if (!(row instanceof HTMLElement) || row.dataset['id'] === id) {
                    return [];
                }

                const { top, height } = row.getBoundingClientRect();

                return [top + height / 2];
            });

        // Shared: the indicator in connect$ and the move in commands$ must read one gesture, not two.
        this.drags$ = fromElementEvent$(items, 'pointerdown').pipe(
            mergeMap(start => {
                const id = dataOf(start.target, 'grip');

                return id === undefined || !start.isPrimary || start.button !== 0
                    ? EMPTY
                    : of({ start, id });
            }),
            switchMap(({ start, id }) => {
                start.preventDefault();
                const same = (event: PointerEvent): boolean => event.pointerId === start.pointerId;
                const at = (event: PointerEvent, phase: Drag['phase']): Drag => ({
                    id,
                    to: middlesExcept(id).filter(middle => middle < event.clientY).length,
                    phase,
                });

                return merge(
                    fromDocumentEvent$('pointermove').pipe(
                        filter(same),
                        startWith(start),
                        map(event => at(event, 'moving')),
                    ),
                    ...ENDS.map(end =>
                        fromDocumentEvent$(end).pipe(
                            filter(same),
                            map(event => at(event, end === 'pointerup' ? 'dropped' : 'cancelled')),
                        ),
                    ),
                ).pipe(takeWhile(({ phase }) => phase === 'moving', true));
            }),
            share(),
        );

        this.commands$ = merge(
            this.submitted$.pipe(map((text): LinkCommand => ({ kind: 'add', text }))),
            this.drags$.pipe(
                mergeMap(({ id, to, phase }): Observable<LinkCommand> =>
                    phase === 'dropped' ? of({ kind: 'move', id, to }) : EMPTY,
                ),
            ),
            fromElementEvent$(items, 'keydown').pipe(
                mergeMap((event): Observable<LinkCommand> => {
                    const id = dataOf(event.target, 'grip');
                    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;

                    if (id === undefined || step === 0) {
                        return EMPTY;
                    }

                    // Handled here: the canvas would otherwise read the same arrow as a section step.
                    event.preventDefault();
                    const index = [...items.children].findIndex(
                        row => row instanceof HTMLElement && row.dataset['id'] === id,
                    );

                    return index < 0 ? EMPTY : of({ kind: 'move', id, to: index + step });
                }),
            ),
            fromElementEvent$(items, 'change').pipe(
                mergeMap(({ target }): Observable<LinkCommand> => {
                    const id = dataOf(target, 'rename');

                    return target instanceof HTMLInputElement && id !== undefined
                        ? of({ kind: 'rename', id, title: target.value })
                        : EMPTY;
                }),
            ),
            fromElementEvent$(items, 'click').pipe(
                mergeMap(({ target }): Observable<LinkCommand> => {
                    const id = dataOf(target, 'remove');

                    return id === undefined ? EMPTY : of({ kind: 'remove', id });
                }),
            ),
        );
    }

    connect$(links$: Observable<readonly Link[]>): Observable<void> {
        const shadow = this.shadow;
        const items = requireChild(shadow, '.items');
        const form = requireElement(shadow, '.add', HTMLFormElement);
        const draft = requireElement(shadow, '.draft', HTMLInputElement);

        return merge(
            links$.pipe(
                tap(links => {
                    this.toggleAttribute('data-empty', links.length === 0);

                    const active = shadow.activeElement;
                    const existing = new Map(
                        [...items.children]
                            .filter(child => child instanceof HTMLElement)
                            .map(child => [child.dataset['id'], child]),
                    );
                    const shown = links.map(link => {
                        const item = existing.get(link.id) ?? itemOf(link.id);
                        filled(item, link, active);

                        return item;
                    });

                    if (
                        shown.length !== items.children.length ||
                        shown.some((item, index) => items.children[index] !== item)
                    ) {
                        items.replaceChildren(...shown);
                    }

                    // A reorder re-inserts the rows, which drops the focus of the grip that moved one.
                    if (
                        active instanceof HTMLElement &&
                        active !== shadow.activeElement &&
                        active.isConnected
                    ) {
                        active.focus();
                    }
                }),
            ),
            this.submitted$.pipe(
                tap(text => {
                    if (addable(text)) {
                        form.reset();
                    }

                    draft.toggleAttribute('data-invalid', !addable(text));
                }),
            ),
            fromElementEvent$(draft, 'input').pipe(
                tap(() => {
                    draft.removeAttribute('data-invalid');
                }),
            ),
            this.editing$.pipe(
                tap(editing => {
                    for (const item of items.children) {
                        if (item instanceof HTMLElement) {
                            item.toggleAttribute('data-editing', item.dataset['id'] === editing);
                        }
                    }

                    const input =
                        editing === null
                            ? null
                            : items.querySelector(`[data-rename="${CSS.escape(editing)}"]`);

                    if (input instanceof HTMLInputElement) {
                        input.focus();
                        input.select();
                    }
                }),
            ),
            fromElementEvent$(items, 'keydown').pipe(
                tap(event => {
                    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
                        event.preventDefault();
                        event.target.blur();
                    }
                }),
            ),
            this.drags$.pipe(
                tap(({ id, to, phase }) => {
                    const rows = [...items.children].filter(row => row instanceof HTMLElement);

                    for (const row of rows) {
                        row.removeAttribute('data-dragging');
                        row.removeAttribute('data-drop-before');
                        row.removeAttribute('data-drop-after');
                    }

                    if (phase !== 'moving') {
                        return;
                    }

                    const others = rows.filter(row => row.dataset['id'] !== id);
                    const dragged = rows.find(row => row.dataset['id'] === id);
                    dragged?.setAttribute('data-dragging', '');
                    const grip = dragged?.querySelector('.grip');

                    // The press is preventDefaulted, which also cancels the focus a click would give the grip.
                    if (grip instanceof HTMLElement && grip !== shadow.activeElement) {
                        grip.focus();
                    }
                    (others[to] ?? others.at(-1))?.setAttribute(
                        to < others.length ? 'data-drop-before' : 'data-drop-after',
                        '',
                    );
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-links', HksLinks);
