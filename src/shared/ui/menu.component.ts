import { html } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { asapScheduler, combineLatest, merge, timer, type Observable } from 'rxjs';
import {
    filter,
    map,
    mergeMap,
    observeOn,
    scan,
    share,
    startWith,
    switchMap,
    tap,
} from 'rxjs/operators';
import { styleSheet, visibleViewport } from '../../lib/dom.ts';
import { renderView, type RenderView } from '../../lib/lit.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import { opensAbove } from '../../layout/frame.ts';
import {
    closedMenu,
    ordered,
    pickedBy,
    reduceMenu,
    type Menu,
    type MenuAction,
    type MenuGroup,
    type MenuPick,
} from '../menu.ts';
import { controlsSheet } from './controls.component.ts';
import { Icon } from './icon.component.ts';
import css from './menu.css?inline';

const sheet = styleSheet(css);
const ARMED_MS = 3000;
const MORE = 'M5 12h.01M12 12h.01M19 12h.01';

type View = { readonly groups: readonly MenuGroup[]; readonly menu: Menu; readonly label: string };
type Folded = { readonly menu: Menu; readonly picked: string | null };

const unfilled: View = { groups: [], menu: closedMenu, label: 'actions' };

const TEMPLATE = ({ groups, menu, label }: View) =>
    html`<button
            class="ui-icon trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded=${String(menu.open)}
            aria-label=${label}
            title=${label}
            ?hidden=${groups.length === 0}
        >
            ${Icon(MORE)}
        </button>
        <div class="panel" role="menu" aria-label=${label} ?data-open=${menu.open}>
            ${repeat(
                groups,
                ({ id }) => id,
                ({ id, items }) =>
                    html`<div class="group" role="group" data-group=${id}>
                        ${repeat(
                            items,
                            item => item.id,
                            item =>
                                item.field === undefined
                                    ? html`<button
                                          class="item"
                                          type="button"
                                          role="menuitem"
                                          data-item=${item.id}
                                          ?data-destructive=${item.destructive === true}
                                          ?data-armed=${menu.armed === item.id}
                                          ?disabled=${item.disabled === true}
                                          title=${ifDefined(item.hint)}
                                      >
                                          ${Icon(item.glyph)}<span
                                              >${
                                                  menu.armed === item.id
                                                      ? `Click again: ${item.label.toLowerCase()}`
                                                      : item.label
                                              }</span
                                          >
                                      </button>`
                                    : html`<form class="field" data-field=${item.id}>
                                          <input
                                              class="ui-field"
                                              type="text"
                                              name="text"
                                              placeholder=${item.field.placeholder}
                                              aria-label=${item.label}
                                              autocomplete="off"
                                              ?disabled=${item.disabled === true}
                                          /><button
                                              class="ui-icon"
                                              type="submit"
                                              aria-label=${item.label}
                                              title=${item.label}
                                              ?disabled=${item.disabled === true}
                                          >
                                              ${Icon(item.glyph)}
                                          </button>
                                      </form>`,
                        )}
                    </div>`,
            )}
        </div>`;

const textIn = (form: HTMLFormElement): string => {
    const input = form.querySelector('input');
    return input instanceof HTMLInputElement ? input.value.trim() : '';
};

const actionOf = (target: EventTarget | null): MenuAction | null => {
    if (!(target instanceof Element)) {
        return null;
    }

    const item = target.closest('[data-item]');

    if (item instanceof HTMLButtonElement) {
        return {
            kind: 'choose',
            item: {
                id: item.getAttribute('data-item') ?? '',
                label: '',
                glyph: '',
                destructive: item.hasAttribute('data-destructive'),
                disabled: item.disabled,
            },
        };
    }

    return target.closest('.trigger') === null ? null : { kind: 'toggle' };
};

export class HksMenu extends HTMLElement {
    readonly picks$: Observable<MenuPick>;

    private readonly panel: HTMLElement;
    private readonly folded$: Observable<Folded>;
    private readonly rendering: RenderView<View>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        const root = document.createElement('div');
        root.className = 'menu';
        shadow.append(root);
        this.rendering = renderView(root, unfilled, TEMPLATE);
        const panel = root.querySelector('.panel');

        if (!(panel instanceof HTMLElement)) {
            throw new Error('hks-menu rendered no panel');
        }

        this.panel = panel;

        const chosen$ = fromElementEvent$(this, 'click').pipe(
            mergeMap(event => {
                const action = actionOf(event.composedPath()[0] ?? null);
                return action === null ? [] : [action];
            }),
            share(),
        );
        // One listener: the text is read once, before the form is cleared.
        const submitted$ = fromElementEvent$(root, 'submit').pipe(
            mergeMap(event => {
                const form = event.target;
                return form instanceof HTMLFormElement ? [{ event, form }] : [];
            }),
            map(({ event, form }) => ({
                event,
                form,
                pick: {
                    id: form.getAttribute('data-field') ?? '',
                    text: textIn(form),
                },
            })),
            tap(({ event, form }) => {
                event.preventDefault();
                form.reset();
            }),
            map(({ pick }): MenuPick => pick),
            share(),
        );
        const actions$ = merge(
            chosen$,
            submitted$.pipe(map((): MenuAction => ({ kind: 'close' }))),
            chosen$.pipe(
                filter(action => action.kind === 'choose'),
                switchMap(() => timer(ARMED_MS).pipe(map((): MenuAction => ({ kind: 'disarm' })))),
            ),
            fromDocumentEvent$('pointerdown').pipe(
                filter(event => !event.composedPath().includes(this)),
                map((): MenuAction => ({ kind: 'close' })),
            ),
            fromElementEvent$(this, 'keydown').pipe(
                filter(({ key }) => key === 'Escape'),
                map((): MenuAction => ({ kind: 'close' })),
            ),
        );

        // One fold for what is shown and what is picked: a second scan would arm on its own.
        this.folded$ = actions$.pipe(
            scan(
                ({ menu }: Folded, action): Folded => ({
                    menu: reduceMenu(menu, action),
                    picked: pickedBy(menu, action),
                }),
                { menu: closedMenu, picked: null },
            ),
            share(),
        );
        this.picks$ = merge(
            this.folded$.pipe(
                mergeMap(({ picked }): MenuPick[] =>
                    picked === null ? [] : [{ id: picked, text: null }],
                ),
            ),
            submitted$,
        );
    }

    connect$(groups$: Observable<readonly MenuGroup[]>, label = 'actions'): Observable<void> {
        const menu$ = this.folded$.pipe(
            map(({ menu }) => menu),
            startWith(closedMenu),
        );

        return merge(
            this.rendering.lifetime$,
            combineLatest([groups$.pipe(map(ordered)), menu$]).pipe(
                tap(([groups, menu]) => {
                    this.rendering.update({ groups, menu, label });
                    this.toggleAttribute('data-open', menu.open);
                }),
                map(([, menu]) => menu.open),
                filter(open => open),
                observeOn(asapScheduler),
                tap(() => {
                    this.panel.removeAttribute('data-above');
                }),
                map(() =>
                    opensAbove(
                        this.panel.getBoundingClientRect(),
                        this.getBoundingClientRect(),
                        visibleViewport(),
                    ),
                ),
                tap(above => {
                    this.panel.toggleAttribute('data-above', above);
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-menu', HksMenu);
