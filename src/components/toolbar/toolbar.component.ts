import { Icon } from '../../shared/ui/icon.component.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { choiceIndex } from '../../shared/ui/choices.ts';
import { popupPlacement } from '../../shared/select/select.ts';
import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { renderView, type RenderView } from '../../lib/lit.ts';
import { fromEvent, merge, EMPTY, of, type Observable } from 'rxjs';
import { filter, finalize, map, mergeMap, share, tap } from 'rxjs/operators';
import { requireChild, styleSheet, viewportSize } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import css from './toolbar.css?inline';

const sheet = styleSheet(css);
export type ToolbarItem = { readonly id: string; readonly title: string; readonly icon: string };
export type ToolbarCategory = ToolbarItem & { readonly items: readonly ToolbarItem[] };
const template = (categories: readonly ToolbarCategory[]) =>
    html`<div class="programs" role="group" aria-label="Programs">
        ${repeat(
            categories,
            category => category.id,
            category =>
                html`<details class="category">
                    <summary
                        class="key"
                        aria-label=${category.title}
                        title=${category.title}
                        aria-haspopup="menu"
                    >
                        ${Icon(category.icon)}
                    </summary>
                    <div class="places" popover="manual" role="menu" aria-label=${category.title}>
                        <p class="places-title">${category.title}</p>
                        ${repeat(
                            category.items,
                            item => item.id,
                            item =>
                                html`<button
                                    class="ui-button choice"
                                    type="button"
                                    data-program=${item.id}
                                    role="menuitem"
                                    title=${`New ${item.title}`}
                                >
                                    ${Icon(item.icon)}<span>${item.title}</span>
                                </button>`,
                        )}
                    </div>
                </details>`,
        )}
    </div>`;
const menusOf = (root: ShadowRoot): readonly HTMLDetailsElement[] =>
    [...root.querySelectorAll('details')].filter(
        (menu): menu is HTMLDetailsElement => menu instanceof HTMLDetailsElement,
    );
const itemsOf = (menu: HTMLDetailsElement): readonly HTMLButtonElement[] =>
    [...menu.querySelectorAll('[role="menuitem"]')].filter(
        (item): item is HTMLButtonElement => item instanceof HTMLButtonElement && !item.disabled,
    );

export class HksToolbar extends HTMLElement {
    readonly launches$: Observable<string>;
    private readonly root: ShadowRoot;
    private readonly rendering: RenderView<readonly ToolbarCategory[]>;
    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        this.root = root;
        root.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<readonly ToolbarCategory[]>(root, [], template);
        const programs = requireChild(root, '.programs');
        this.launches$ = fromElementEvent$(programs, 'click').pipe(
            mergeMap(({ target }) => {
                const item = target instanceof Element ? target.closest('[data-program]') : null;
                const id = item instanceof HTMLButtonElement ? item.dataset['program'] : undefined;
                return id === undefined ? EMPTY : of(id);
            }),
            share(),
        );
    }
    categories(categories: readonly ToolbarCategory[]): this {
        this.rendering.update(categories);
        return this;
    }
    connect$(): Observable<void> {
        const root = this.root;
        const programs = requireChild(root, '.programs');
        const close = (menu: HTMLDetailsElement) => {
            const panel = requireChild(menu, '.places');
            if (panel.matches(':popover-open')) {
                panel.hidePopover();
            }
            menu.open = false;
        };
        const closeAll = (except: HTMLDetailsElement | null = null) => {
            for (const menu of menusOf(root)) {
                if (menu !== except) {
                    close(menu);
                }
            }
        };
        const open = (menu: HTMLDetailsElement, focus: 'first' | 'last' = 'first') => {
            closeAll(menu);
            const panel = requireChild(menu, '.places');
            const trigger = requireChild(menu, 'summary');
            const placement = popupPlacement(trigger.getBoundingClientRect(), viewportSize(), true);
            panel.style.left = `${placement.left}px`;
            panel.style.top = placement.top === null ? 'auto' : `${placement.top}px`;
            panel.style.bottom = placement.bottom === null ? 'auto' : `${placement.bottom}px`;
            panel.style.width = `${placement.width}px`;
            panel.style.maxHeight = `${placement.height}px`;
            const wasOpen = panel.matches(':popover-open');
            menu.open = true;
            if (!panel.matches(':popover-open') && this.isConnected) {
                panel.showPopover();
            }
            if (!wasOpen && this.isConnected) {
                const items = itemsOf(menu);
                (focus === 'last' ? items.at(-1) : items[0])?.focus();
            }
        };
        return merge(
            this.rendering.lifetime$,
            fromElementEvent$(programs, 'toggle', { capture: true }).pipe(
                tap(({ target }) => {
                    if (target instanceof HTMLDetailsElement) {
                        if (target.open) {
                            open(target);
                        } else {
                            close(target);
                        }
                    }
                }),
            ),
            merge(
                this.launches$,
                fromDocumentEvent$('pointerdown').pipe(
                    filter(event => !event.composedPath().includes(this)),
                ),
            ).pipe(
                tap(() => {
                    closeAll();
                }),
            ),
            fromElementEvent$(programs, 'keydown').pipe(
                mergeMap(event => {
                    const target = event.target;
                    const menu = target instanceof Element ? target.closest('details') : null;
                    if (
                        !(menu instanceof HTMLDetailsElement) ||
                        event.altKey ||
                        event.ctrlKey ||
                        event.metaKey
                    ) {
                        return [];
                    }
                    const trigger = requireChild(menu, 'summary');
                    const items = itemsOf(menu);
                    const index = choiceIndex(
                        items.map(() => true),
                        target instanceof HTMLButtonElement ? items.indexOf(target) : -1,
                        event.key,
                    );
                    return event.key === 'Escape' && menu.open
                        ? [
                              {
                                  event,
                                  apply: () => {
                                      close(menu);
                                      trigger.focus();
                                  },
                              },
                          ]
                        : target === trigger &&
                            (event.key === 'ArrowDown' || event.key === 'ArrowUp')
                          ? [
                                {
                                    event,
                                    apply: () => {
                                        open(menu, event.key === 'ArrowUp' ? 'last' : 'first');
                                    },
                                },
                            ]
                          : target instanceof HTMLButtonElement && index !== null && menu.open
                            ? [
                                  {
                                      event,
                                      apply: () => {
                                          items[index]?.focus();
                                      },
                                  },
                              ]
                            : event.key === 'Tab' && menu.open
                              ? [
                                    {
                                        event,
                                        apply: () => {
                                            close(menu);
                                            trigger.focus();
                                        },
                                    },
                                ]
                              : [];
                }),
                tap(({ event, apply }) => {
                    if (event.key !== 'Tab') {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                    apply();
                }),
            ),
            fromEvent(window, 'resize').pipe(
                tap(() => {
                    for (const menu of menusOf(root)) {
                        if (menu.open) {
                            open(menu);
                        }
                    }
                }),
            ),
        ).pipe(
            map(() => undefined),
            finalize(() => {
                closeAll();
            }),
        );
    }
}
customElements.define('hks-toolbar', HksToolbar);
