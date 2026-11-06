import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { withValue } from '../../lib/lit.ts';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { ref } from 'lit-html/directives/ref.js';

import { renderView, displayValue, type RenderView } from '../../lib/lit.ts';
import { EMPTY, merge, of, type Observable } from 'rxjs';
import { filter, map, mergeMap, share, startWith, switchMap, takeWhile, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import {
    dropTarget,
    faviconOf,
    hostOf,
    safeUrl,
    type BookmarkCommand,
    type Bookmarks,
    type Shelf,
    type Target,
} from './bookmarks.ts';
import css from './bookmarks.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = (view: Bookmarks) =>
    html`<div class="scroll">
        <div class="groups">
            ${repeat(
                view.groups.map(group => group.id),
                item => item,
                id =>
                    withValue(
                        view.groups.find(group => group.id === id),
                        group =>
                            html`<section
                                class="group"
                                data-group=${ifDefined(id)}
                                data-closed=${ifDefined(!group.open ? '' : undefined)}
                            >
                                <header class="head">
                                    <button
                                        type="button"
                                        class="toggle"
                                        data-toggle=${ifDefined(id)}
                                        aria-label="open or close group"
                                        aria-expanded=${ifDefined(group.open)}
                                    ></button
                                    ><button
                                        type="button"
                                        class="group-grip"
                                        data-group-grip=${ifDefined(id)}
                                        aria-label="move group; arrow keys move it"
                                    ></button
                                    ><input
                                        class="group-name"
                                        data-group-name=${ifDefined(id)}
                                        placeholder="Group name"
                                        aria-label="Group name"
                                        autocomplete="off"
                                        ${ref(element => {
                                            if (element instanceof HTMLInputElement) {
                                                displayValue(element, group.name);
                                            }
                                        })}
                                    /><span class="count">${group.items.length}</span
                                    ><button
                                        type="button"
                                        class="remove-group"
                                        data-remove-group=${ifDefined(id)}
                                        aria-label="delete group"
                                        title="only an empty group can be deleted"
                                        ?disabled=${group.items.length > 0}
                                    >
                                        ×
                                    </button>
                                </header>
                                <ul class="items">
                                    ${repeat(
                                        group.items.map(item => item.id),
                                        item => item,
                                        bookmarkId =>
                                            withValue(
                                                group.items.find(item => item.id === bookmarkId),
                                                bookmark =>
                                                    html`<li
                                                        class="bookmark"
                                                        data-bookmark=${ifDefined(bookmarkId)}
                                                    >
                                                        <button
                                                            type="button"
                                                            class="grip"
                                                            data-grip=${ifDefined(bookmarkId)}
                                                            aria-label="move bookmark; arrow keys move it"
                                                        ></button
                                                        ><span class="badge"
                                                            ><span class="letter"
                                                                >${(
                                                                    hostOf(bookmark.url)[0] ?? '?'
                                                                ).toUpperCase()}</span
                                                            ><img
                                                                class="icon"
                                                                alt=""
                                                                decoding="async"
                                                                referrerpolicy="no-referrer"
                                                                ${ref(image => {
                                                                    if (
                                                                        image instanceof
                                                                        HTMLImageElement
                                                                    ) {
                                                                        (() => {
                                                                            const url =
                                                                                bookmark.url;
                                                                            image.parentElement?.removeAttribute(
                                                                                'data-icon',
                                                                            );
                                                                            const src =
                                                                                faviconOf(url);
                                                                            if (src === null) {
                                                                                image.removeAttribute(
                                                                                    'src',
                                                                                );
                                                                            } else {
                                                                                image.src = src;
                                                                            }
                                                                        })();
                                                                    }
                                                                })} /></span
                                                        ><a
                                                            class="link"
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            href=${ifDefined(bookmark.url)}
                                                            title=${ifDefined(bookmark.url)}
                                                            ><span class="name"
                                                                >${bookmark.name}</span
                                                            ><span class="host"
                                                                >${
                                                                    bookmark.name ===
                                                                    hostOf(bookmark.url)
                                                                        ? ''
                                                                        : hostOf(bookmark.url)
                                                                }</span
                                                            ></a
                                                        >
                                                        <div class="editor">
                                                            <input
                                                                class="rename"
                                                                data-rename=${ifDefined(bookmarkId)}
                                                                placeholder="Name"
                                                                aria-label="Name"
                                                                autocomplete="off"
                                                                ${ref(element => {
                                                                    if (
                                                                        element instanceof
                                                                        HTMLInputElement
                                                                    ) {
                                                                        displayValue(
                                                                            element,
                                                                            bookmark.name,
                                                                        );
                                                                    }
                                                                })}
                                                            /><input
                                                                class="readdress"
                                                                data-readdress=${ifDefined(bookmarkId)}
                                                                placeholder="Address"
                                                                aria-label="Address"
                                                                autocomplete="off"
                                                                ${ref(element => {
                                                                    if (
                                                                        element instanceof
                                                                        HTMLInputElement
                                                                    ) {
                                                                        displayValue(
                                                                            element,
                                                                            bookmark.url,
                                                                        );
                                                                    }
                                                                })}
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            class="edit"
                                                            data-edit=${ifDefined(bookmarkId)}
                                                            aria-label="edit bookmark"
                                                        >
                                                            ✎</button
                                                        ><button
                                                            type="button"
                                                            class="remove"
                                                            data-remove=${ifDefined(bookmarkId)}
                                                            aria-label="delete bookmark"
                                                        >
                                                            ×
                                                        </button>
                                                    </li>`,
                                            ),
                                    )}
                                </ul>
                                <form class="add" data-add=${ifDefined(id)}>
                                    <input
                                        class="new-name"
                                        data-new-name=${ifDefined(id)}
                                        placeholder="Name"
                                        aria-label="Name"
                                        autocomplete="off"
                                    /><input
                                        class="new-address"
                                        data-new-address=${ifDefined(id)}
                                        placeholder="https://…"
                                        aria-label="https://…"
                                        autocomplete="off"
                                    /><button type="submit" class="submit">Add</button>
                                </form>
                            </section>`,
                    ),
            )}
        </div>
        <button class="add-group" type="button">+ group</button>
    </div>`;

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

    private readonly rendering: RenderView<Bookmarks>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        this.rendering = renderView<Bookmarks>(shadow, { groups: [], made: 0 }, TEMPLATE);

        const scroll = requireChild(shadow, '.scroll');
        this.groups = requireChild(shadow, '.groups');
        const groups = this.groups;

        // One listener, shared: the drafts are read once, before anyone clears them.
        this.submitted$ = fromElementEvent$(scroll, 'submit').pipe(
            // Not a page navigation: the form exists for Enter, not to be sent anywhere.
            tap(event => {
                event.preventDefault();
            }),
            mergeMap(event => {
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
            // Otherwise the press starts a text selection across everything it passes.
            tap(({ start }) => {
                start.preventDefault();
            }),
            switchMap(({ start, kind, id }) => {
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
                mergeMap(event => {
                    const step: 'up' | 'down' | null =
                        event.key === 'ArrowUp' ? 'up' : event.key === 'ArrowDown' ? 'down' : null;
                    const bookmark = dataOf(event.target, 'grip');
                    const group = dataOf(event.target, 'groupGrip');

                    return step === null || (bookmark === undefined && group === undefined)
                        ? []
                        : [{ event, step, bookmark, group }];
                }),
                // Handled here: the canvas would otherwise read the same arrow as a section step.
                tap(({ event }) => {
                    event.preventDefault();
                }),
                mergeMap(({ step, bookmark, group }): BookmarkCommand[] => {
                    if (bookmark !== undefined) {
                        return [{ kind: 'step', id: bookmark, step }];
                    }

                    const index = elementsIn(groups).findIndex(
                        section => section.dataset['group'] === group,
                    );

                    return group === undefined || index < 0
                        ? []
                        : [{ kind: 'move-group', id: group, to: index + (step === 'up' ? -1 : 1) }];
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
            this.rendering.lifetime$,
            merge(
                // Captured: load and error do not bubble, so the list only hears them on the way down.
                merge(
                    fromElementEvent$(scroll, 'load', { capture: true }),
                    fromElementEvent$(scroll, 'error', { capture: true }),
                ).pipe(
                    tap(({ type, target }) => {
                        if (
                            target instanceof HTMLImageElement &&
                            target.classList.contains('icon')
                        ) {
                            target.parentElement?.toggleAttribute(
                                'data-icon',
                                type === 'load' && target.naturalWidth > 1,
                            );
                        }
                    }),
                ),
                bookmarks$.pipe(
                    tap(bookmarks => {
                        const active = shadow.activeElement;
                        const id =
                            active instanceof HTMLElement ? active.dataset['grip'] : undefined;
                        this.rendering.update(bookmarks);
                        if (
                            id !== undefined &&
                            active instanceof HTMLElement &&
                            !active.isConnected
                        ) {
                            const replacement = shadow.querySelector(
                                `[data-grip="${CSS.escape(id)}"]`,
                            );
                            if (replacement instanceof HTMLElement) {
                                replacement.focus();
                            }
                        }
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
                    mergeMap(event => {
                        const { target } = event;

                        return event.key === 'Enter' &&
                            target instanceof HTMLInputElement &&
                            target.closest('.add') === null
                            ? [{ event, target }]
                            : [];
                    }),
                    tap(({ event, target }) => {
                        event.preventDefault();
                        target.blur();
                    }),
                ),
                this.drags$.pipe(
                    tap(drag => {
                        indicated(shadow, groups, drag);
                    }),
                ),
            ).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-bookmarks', HksBookmarks);
