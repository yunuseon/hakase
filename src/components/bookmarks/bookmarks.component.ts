import { EMPTY, merge, of, type Observable } from 'rxjs';
import { filter, map, mergeMap, share, startWith, switchMap, takeWhile, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import {
    dropTarget,
    faviconOf,
    hostOf,
    safeUrl,
    type Bookmark,
    type BookmarkCommand,
    type Bookmarks,
    type Group,
    type Shelf,
    type Target,
} from './bookmarks.ts';
import css from './bookmarks.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <div class="scroll">
        <div class="groups"></div>
        <button class="add-group" type="button">+ group</button>
    </div>
`;

const ENDS = ['pointerup', 'pointercancel'] as const;

type DragPhase = 'moving' | 'dropped' | 'cancelled';

type Drag =
    | {
          readonly kind: 'bookmark';
          readonly id: string;
          readonly target: Target | null;
          readonly phase: DragPhase;
      }
    | {
          readonly kind: 'group';
          readonly id: string;
          readonly to: number;
          readonly phase: DragPhase;
      };

type Submitted = {
    readonly form: HTMLFormElement;
    readonly group: string;
    readonly name: string;
    readonly address: string;
};

const dashed = (key: string): string => key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);

const dataOf = (target: EventTarget | null, key: string): string | undefined => {
    const element = target instanceof Element ? target.closest(`[data-${dashed(key)}]`) : null;

    return element instanceof HTMLElement ? element.dataset[key] : undefined;
};

const elementsIn = (parent: Element): HTMLElement[] =>
    [...parent.children].filter(child => child instanceof HTMLElement);

const middleY = (element: Element): number => {
    const { top, height } = element.getBoundingClientRect();

    return top + height / 2;
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

const input = (
    className: string,
    key: string,
    id: string,
    placeholder: string,
): HTMLInputElement => {
    const element = document.createElement('input');
    element.className = className;
    element.dataset[key] = id;
    element.placeholder = placeholder;
    element.autocomplete = 'off';
    element.setAttribute('aria-label', placeholder);

    return element;
};

const groupOf = (id: string): HTMLElement => {
    const section = document.createElement('section');
    section.className = 'group';
    section.dataset['group'] = id;

    const head = document.createElement('header');
    head.className = 'head';

    const toggle = button('toggle', 'toggle', id, '', 'open or close group');
    const grip = button('group-grip', 'groupGrip', id, '', 'move group; arrow keys move it');
    const name = input('group-name', 'groupName', id, 'Group name');

    const count = document.createElement('span');
    count.className = 'count';

    const remove = button('remove-group', 'removeGroup', id, '×', 'delete group');
    remove.title = 'only an empty group can be deleted';

    head.append(toggle, grip, name, count, remove);

    const items = document.createElement('ul');
    items.className = 'items';

    const add = document.createElement('form');
    add.className = 'add';
    add.dataset['add'] = id;
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'submit';
    submit.textContent = 'Add';
    add.append(
        input('new-name', 'newName', id, 'Name'),
        input('new-address', 'newAddress', id, 'https://…'),
        submit,
    );

    section.append(head, items, add);

    return section;
};

const bookmarkOf = (id: string): HTMLElement => {
    const item = document.createElement('li');
    item.className = 'bookmark';
    item.dataset['bookmark'] = id;

    const grip = button('grip', 'grip', id, '', 'move bookmark; arrow keys move it');

    const badge = document.createElement('span');
    badge.className = 'badge';
    const letter = document.createElement('span');
    letter.className = 'letter';
    const icon = document.createElement('img');
    icon.className = 'icon';
    icon.alt = '';
    icon.decoding = 'async';
    // The site learns its icon was asked for, but not from which page.
    icon.referrerPolicy = 'no-referrer';
    badge.append(letter, icon);

    const anchor = document.createElement('a');
    anchor.className = 'link';
    anchor.target = '_blank';
    // Not just target: without noopener the opened page can navigate this one.
    anchor.rel = 'noopener noreferrer';
    anchor.innerHTML = '<span class="name"></span><span class="host"></span>';

    const editor = document.createElement('div');
    editor.className = 'editor';
    editor.append(
        input('rename', 'rename', id, 'Name'),
        input('readdress', 'readdress', id, 'Address'),
    );

    item.append(
        grip,
        badge,
        anchor,
        editor,
        button('edit', 'edit', id, '✎', 'edit bookmark'),
        button('remove', 'remove', id, '×', 'delete bookmark'),
    );

    return item;
};

const write = (field: Element | null, value: string, active: Element | null): void => {
    // Not while focused: that would overwrite what is being typed with another window's edit.
    if (field instanceof HTMLInputElement && field !== active && field.value !== value) {
        field.value = value;
    }
};

const fillBookmark = (item: HTMLElement, { name, url }: Bookmark, active: Element | null): void => {
    const host = hostOf(url);
    const anchor = item.querySelector('.link');

    if (anchor instanceof HTMLAnchorElement) {
        anchor.href = url;
        anchor.title = url;
    }

    const shownName = item.querySelector('.name');
    const shownHost = item.querySelector('.host');
    const letter = item.querySelector('.letter');

    if (shownName !== null) {
        shownName.textContent = name;
    }

    if (shownHost !== null) {
        shownHost.textContent = name === host ? '' : host;
    }

    if (letter !== null) {
        letter.textContent = (host[0] ?? '?').toUpperCase();
    }

    write(item.querySelector('.rename'), name, active);
    write(item.querySelector('.readdress'), url, active);

    const icon = item.querySelector('.icon');
    const wanted = faviconOf(url);

    // Only when it changes: setting src again would refetch and flash the letter back.
    if (icon instanceof HTMLImageElement && icon.dataset['for'] !== url) {
        icon.dataset['for'] = url;
        item.querySelector('.badge')?.removeAttribute('data-icon');

        if (wanted === null) {
            icon.removeAttribute('src');
        } else {
            icon.src = wanted;
        }
    }
};

// Only when the order differs: moving a node drops its focus, and a click that lands on it.
const ordered = (parent: Element, children: readonly HTMLElement[]): void => {
    const current = elementsIn(parent);

    if (
        current.length !== children.length ||
        children.some((child, index) => current[index] !== child)
    ) {
        parent.replaceChildren(...children);
    }
};

const fillGroup = (
    section: HTMLElement,
    group: Group,
    items: readonly HTMLElement[],
    active: Element | null,
): void => {
    section.toggleAttribute('data-closed', !group.open);
    section.querySelector('.toggle')?.setAttribute('aria-expanded', String(group.open));
    write(section.querySelector('.group-name'), group.name, active);

    const count = section.querySelector('.count');

    if (count !== null) {
        count.textContent = String(group.items.length);
    }

    const remove = section.querySelector('.remove-group');

    if (remove instanceof HTMLButtonElement) {
        remove.disabled = group.items.length > 0;
    }

    const list = section.querySelector('.items');

    if (list !== null) {
        ordered(list, items);
    }
};

const rendered = (shadow: ShadowRoot, groups: HTMLElement, { groups: model }: Bookmarks): void => {
    const active = shadow.activeElement;
    const sections = new Map(
        elementsIn(groups).map(section => [section.dataset['group'], section]),
    );
    const items = new Map(
        [...shadow.querySelectorAll('.bookmark')]
            .filter(item => item instanceof HTMLElement)
            .map(item => [item.dataset['bookmark'], item]),
    );

    ordered(
        groups,
        model.map(group => {
            const section = sections.get(group.id) ?? groupOf(group.id);
            const shown = group.items.map(bookmark => {
                const item = items.get(bookmark.id) ?? bookmarkOf(bookmark.id);
                fillBookmark(item, bookmark, active);

                return item;
            });
            fillGroup(section, group, shown, active);

            return section;
        }),
    );

    // A bookmark moved to another group was re-inserted, which drops its focus.
    if (active instanceof HTMLElement && active.isConnected && active !== shadow.activeElement) {
        active.focus();
    }
};

const indicated = (shadow: ShadowRoot, groups: HTMLElement, drag: Drag): void => {
    const marks = ['data-dragging', 'data-drop-before', 'data-drop-after', 'data-drop-into'];

    for (const element of shadow.querySelectorAll('.group, .bookmark')) {
        for (const mark of marks) {
            element.removeAttribute(mark);
        }
    }

    if (drag.phase !== 'moving') {
        return;
    }

    const selector = drag.kind === 'bookmark' ? 'data-bookmark' : 'data-group';
    const dragged = shadow.querySelector(`[${selector}="${CSS.escape(drag.id)}"]`);
    dragged?.setAttribute('data-dragging', '');
    const grip = dragged?.querySelector(drag.kind === 'bookmark' ? '.grip' : '.group-grip');

    // The press is preventDefaulted, which also cancels the focus a click would give the grip.
    if (grip instanceof HTMLElement && grip !== shadow.activeElement) {
        grip.focus();
    }

    const mark = (others: readonly HTMLElement[], to: number, empty: Element | null): void => {
        const before = others[to];

        if (before !== undefined) {
            before.setAttribute('data-drop-before', '');
        } else if (others.length > 0) {
            others.at(-1)?.setAttribute('data-drop-after', '');
        } else {
            empty?.setAttribute('data-drop-into', '');
        }
    };

    if (drag.kind === 'group') {
        mark(
            elementsIn(groups).filter(section => section !== dragged),
            drag.to,
            null,
        );

        return;
    }

    if (drag.target === null) {
        return;
    }

    const section = shadow.querySelector(`[data-group="${CSS.escape(drag.target.group)}"]`);
    const list = section?.querySelector('.items');
    const others = list === null || list === undefined ? [] : elementsIn(list);
    mark(
        others.filter(item => item !== dragged),
        drag.target.to,
        section ?? null,
    );
};

export class HksBookmarks extends HTMLElement {
    readonly commands$: Observable<BookmarkCommand>;

    private readonly shadow: ShadowRoot;
    private readonly groups: HTMLElement;
    private readonly drags$: Observable<Drag>;
    private readonly submitted$: Observable<Submitted>;
    private readonly editing$: Observable<string | null>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        const scroll = requireChild(shadow, '.scroll');
        this.groups = requireChild(shadow, '.groups');
        const groups = this.groups;

        // One listener, shared: the drafts are read once, before anyone clears them.
        this.submitted$ = fromElementEvent$(scroll, 'submit').pipe(
            mergeMap(event => {
                // Not a page navigation: the form exists for Enter, not to be sent anywhere.
                event.preventDefault();
                const form = event.target instanceof HTMLFormElement ? event.target : null;
                const group = form?.dataset['add'];
                const name = form?.querySelector('.new-name');
                const address = form?.querySelector('.new-address');

                return form === null ||
                    group === undefined ||
                    !(name instanceof HTMLInputElement) ||
                    !(address instanceof HTMLInputElement)
                    ? EMPTY
                    : of({ form, group, name: name.value, address: address.value });
            }),
            share(),
        );

        this.editing$ = merge(
            fromElementEvent$(scroll, 'click').pipe(
                mergeMap(({ target }) => {
                    const id = dataOf(target, 'edit');

                    return id === undefined ? EMPTY : of(id);
                }),
            ),
            fromElementEvent$(scroll, 'focusout').pipe(
                filter(({ target, relatedTarget }) => {
                    const editor = target instanceof Element ? target.closest('.editor') : null;

                    // Moving between the name and the address keeps the editor open.
                    return (
                        editor !== null &&
                        !(relatedTarget instanceof Node && editor.contains(relatedTarget))
                    );
                }),
                map(() => null),
            ),
        ).pipe(share());

        const shelvesExcept = (id: string): readonly Shelf[] =>
            elementsIn(groups).flatMap(section => {
                const group = section.dataset['group'];
                const list = section.querySelector('.items');

                if (group === undefined || list === null) {
                    return [];
                }

                const { top, bottom } = section.getBoundingClientRect();
                const middles = section.hasAttribute('data-closed')
                    ? []
                    : elementsIn(list)
                          .filter(item => item.dataset['bookmark'] !== id)
                          .map(middleY);

                return [{ id: group, top, bottom, middles }];
            });

        const groupIndex = (id: string, y: number): number =>
            elementsIn(groups)
                .filter(section => section.dataset['group'] !== id)
                .map(middleY)
                .filter(middle => middle < y).length;

        // Shared: the indicator in connect$ and the move in commands$ must read one gesture, not two.
        this.drags$ = fromElementEvent$(scroll, 'pointerdown').pipe(
            mergeMap(start => {
                const bookmark = dataOf(start.target, 'grip');
                const group = dataOf(start.target, 'groupGrip');

                if (!start.isPrimary || start.button !== 0) {
                    return EMPTY;
                }

                return bookmark !== undefined
                    ? of({ start, kind: 'bookmark' as const, id: bookmark })
                    : group !== undefined
                      ? of({ start, kind: 'group' as const, id: group })
                      : EMPTY;
            }),
            switchMap(({ start, kind, id }) => {
                // Otherwise the press starts a text selection across everything it passes.
                start.preventDefault();
                const same = (event: PointerEvent): boolean => event.pointerId === start.pointerId;
                const at = (event: PointerEvent, phase: DragPhase): Drag =>
                    kind === 'bookmark'
                        ? { kind, id, target: dropTarget(event.clientY, shelvesExcept(id)), phase }
                        : { kind, id, to: groupIndex(id, event.clientY), phase };

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
            this.submitted$.pipe(
                map(({ group, name, address }): BookmarkCommand => ({
                    kind: 'add',
                    group,
                    name,
                    address,
                })),
            ),
            this.drags$.pipe(
                mergeMap((drag): Observable<BookmarkCommand> => {
                    if (drag.phase !== 'dropped') {
                        return EMPTY;
                    }

                    if (drag.kind === 'group') {
                        return of({ kind: 'move-group', id: drag.id, to: drag.to });
                    }

                    return drag.target === null
                        ? EMPTY
                        : of({ kind: 'move', id: drag.id, ...drag.target });
                }),
            ),
            fromElementEvent$(scroll, 'keydown').pipe(
                mergeMap((event): Observable<BookmarkCommand> => {
                    const step =
                        event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowDown' ? 'down' : null;
                    const bookmark = dataOf(event.target, 'grip');
                    const group = dataOf(event.target, 'groupGrip');

                    if (step === null || (bookmark === undefined && group === undefined)) {
                        return EMPTY;
                    }

                    // Handled here: the canvas would otherwise read the same arrow as a section step.
                    event.preventDefault();

                    if (bookmark !== undefined) {
                        return of({ kind: 'step', id: bookmark, step });
                    }

                    const index = elementsIn(groups).findIndex(
                        section => section.dataset['group'] === group,
                    );

                    return group === undefined || index < 0
                        ? EMPTY
                        : of({
                              kind: 'move-group',
                              id: group,
                              to: index + (step === 'up' ? -1 : 1),
                          });
                }),
            ),
            fromElementEvent$(scroll, 'change').pipe(
                mergeMap(({ target }): Observable<BookmarkCommand> => {
                    if (!(target instanceof HTMLInputElement)) {
                        return EMPTY;
                    }

                    const rename = target.dataset['rename'];
                    const readdress = target.dataset['readdress'];
                    const group = target.dataset['groupName'];

                    return rename !== undefined
                        ? of({ kind: 'rename', id: rename, name: target.value })
                        : readdress !== undefined
                          ? of({ kind: 'readdress', id: readdress, address: target.value })
                          : group !== undefined
                            ? of({ kind: 'rename-group', id: group, name: target.value })
                            : EMPTY;
                }),
            ),
            fromElementEvent$(scroll, 'click').pipe(
                mergeMap(({ target }): Observable<BookmarkCommand> => {
                    const remove = dataOf(target, 'remove');
                    const removeGroup = dataOf(target, 'removeGroup');
                    const toggle = dataOf(target, 'toggle');

                    if (target instanceof Element && target.closest('.add-group') !== null) {
                        return of({ kind: 'add-group' });
                    }

                    return remove !== undefined
                        ? of({ kind: 'remove', id: remove })
                        : removeGroup !== undefined
                          ? of({ kind: 'remove-group', id: removeGroup })
                          : toggle !== undefined
                            ? of({ kind: 'toggle-group', id: toggle })
                            : EMPTY;
                }),
            ),
        );
    }

    connect$(bookmarks$: Observable<Bookmarks>): Observable<void> {
        const shadow = this.shadow;
        const groups = this.groups;
        const scroll = requireChild(shadow, '.scroll');

        return merge(
            // Captured: load and error do not bubble, so the list only hears them on the way down.
            merge(
                fromElementEvent$(scroll, 'load', { capture: true }),
                fromElementEvent$(scroll, 'error', { capture: true }),
            ).pipe(
                tap(({ type, target }) => {
                    if (target instanceof HTMLImageElement && target.classList.contains('icon')) {
                        target.parentElement?.toggleAttribute(
                            'data-icon',
                            type === 'load' && target.naturalWidth > 1,
                        );
                    }
                }),
            ),
            bookmarks$.pipe(
                tap(bookmarks => {
                    rendered(shadow, groups, bookmarks);
                }),
            ),
            this.submitted$.pipe(
                tap(({ form, address }) => {
                    const valid = safeUrl(address) !== null;
                    const field = form.querySelector('.new-address');

                    if (valid) {
                        form.reset();
                    }

                    field?.toggleAttribute('data-invalid', !valid);
                }),
            ),
            fromElementEvent$(scroll, 'input').pipe(
                tap(({ target }) => {
                    if (target instanceof HTMLInputElement) {
                        target.removeAttribute('data-invalid');
                    }
                }),
            ),
            this.editing$.pipe(
                tap(editing => {
                    for (const item of shadow.querySelectorAll('.bookmark')) {
                        item.toggleAttribute(
                            'data-editing',
                            item instanceof HTMLElement && item.dataset['bookmark'] === editing,
                        );
                    }

                    const field =
                        editing === null
                            ? null
                            : shadow.querySelector(`[data-rename="${CSS.escape(editing)}"]`);

                    if (field instanceof HTMLInputElement) {
                        field.focus();
                        field.select();
                    }
                }),
            ),
            fromElementEvent$(scroll, 'keydown').pipe(
                tap(event => {
                    const { target } = event;

                    if (
                        event.key === 'Enter' &&
                        target instanceof HTMLInputElement &&
                        target.closest('.add') === null
                    ) {
                        event.preventDefault();
                        target.blur();
                    }
                }),
            ),
            this.drags$.pipe(
                tap(drag => {
                    indicated(shadow, groups, drag);
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-bookmarks', HksBookmarks);
