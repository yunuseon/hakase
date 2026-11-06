import { controlsSheet } from '../ui/controls.component.ts';
import { html } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { repeat } from 'lit-html/directives/repeat.js';

import { renderView, type RenderView } from '../../lib/lit.ts';
import { fromEvent, merge, Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    finalize,
    map,
    mergeMap,
    pairwise,
    scan,
    shareReplay,
    startWith,
    takeUntil,
    tap,
} from 'rxjs/operators';
import { requireChild, requireElement, styleSheet, viewportSize } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import {
    emptySelect,
    matchingOptions,
    popupPlacement,
    reduceSelect,
    type SelectAction,
    type SelectConfig,
    type SelectSession,
    type SelectOption,
} from './select.ts';
import css from './select.css?inline';

const sheet = styleSheet(css);
type SelectRender = {
    readonly session: SelectSession;
    readonly found: readonly SelectOption[];
    readonly placement: ReturnType<typeof popupPlacement>;
    readonly searching: boolean;
};

export class HksSelect extends HTMLElement {
    readonly changes$: Observable<string>;
    private readonly root: ShadowRoot;

    private readonly rendering: RenderView<SelectRender>;

    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.root.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<SelectRender>(
            this.root,
            {
                session: emptySelect,
                found: [],
                placement: popupPlacement(
                    { left: 0, top: 0, bottom: 0, width: 0 },
                    { width: 960, height: 600 },
                ),
                searching: false,
            },
            view =>
                html`<button
                        class="trigger"
                        type="button"
                        role="combobox"
                        aria-haspopup="listbox"
                        aria-controls="choices"
                        ?hidden=${view.session.config.editable}
                        ?disabled=${view.session.config.disabled}
                        aria-label=${ifDefined(view.session.config.label)}
                        aria-expanded=${ifDefined(view.session.open)}
                        aria-activedescendant=${ifDefined(
                            view.session.open && view.session.active >= 0
                                ? `choice-${view.session.active}`
                                : undefined,
                        )}
                    >
                        <span class="label"
                            >${
                                view.session.config.options.find(
                                    option => option.value === view.session.config.value,
                                )?.label ?? view.session.config.placeholder
                            }</span
                        ><svg class="chevron" viewBox="0 0 12 12" aria-hidden="true">
                            <path d="m2 4 4 4 4-4"></path>
                        </svg></button
                    ><input
                        class="ui-field editor"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-controls="choices"
                        autocomplete="off"
                        ?hidden=${!view.session.config.editable}
                        ?disabled=${view.session.config.disabled}
                        placeholder=${ifDefined(view.session.config.placeholder)}
                        .value=${view.session.query}
                        aria-label=${ifDefined(view.session.config.label)}
                        aria-expanded=${ifDefined(view.session.open)}
                        aria-activedescendant=${ifDefined(
                            view.session.open && view.session.active >= 0
                                ? `choice-${view.session.active}`
                                : undefined,
                        )}
                    />
                    <div
                        class="panel"
                        popover="manual"
                        style=${styleMap({
                            left: `${view.placement.left}px`,
                            top: view.placement.top === null ? 'auto' : `${view.placement.top}px`,
                            bottom:
                                view.placement.bottom === null
                                    ? 'auto'
                                    : `${view.placement.bottom}px`,
                            width: `${view.placement.width}px`,
                            'max-height': `${view.placement.height}px`,
                        })}
                    >
                        <input
                            class="ui-field search"
                            type="search"
                            autocomplete="off"
                            ?hidden=${!view.searching}
                            .value=${view.session.query}
                            aria-label=${ifDefined(`search ${view.session.config.label}`)}
                            aria-controls="choices"
                            aria-activedescendant=${ifDefined(
                                view.session.open && view.session.active >= 0
                                    ? `choice-${view.session.active}`
                                    : undefined,
                            )}
                        />
                        <div
                            id="choices"
                            class="results"
                            role="listbox"
                            aria-label=${ifDefined(view.session.config.label)}
                        >
                            ${repeat(
                                view.found,
                                (_item, index) => index,
                                (option, index) =>
                                    html`<button
                                        type="button"
                                        tabindex="-1"
                                        class="option"
                                        role="option"
                                        id=${ifDefined(`choice-${index}`)}
                                        data-value=${ifDefined(option.value)}
                                        ?disabled=${option.disabled}
                                        aria-selected=${ifDefined(option.value === view.session.config.value)}
                                        data-active=${ifDefined(index === view.session.active ? '' : undefined)}
                                    >
                                        ${option.label}
                                    </button>`,
                            )}
                        </div>
                        <p class="empty" ?hidden=${view.found.length > 0}>No matches</p>
                    </div>`,
        );
        this.changes$ = fromElementEvent$(this, 'change').pipe(map(() => this.value));
    }

    get options(): NodeListOf<HTMLOptionElement> {
        return this.querySelectorAll('option');
    }
    get value(): string {
        const stored = this.getAttribute('value');
        if (this.hasAttribute('editable')) {
            return stored ?? '';
        }
        return stored === null
            ? ([...this.options].find(option => option.selected)?.value ??
                  this.options[0]?.value ??
                  '')
            : [...this.options].some(option => option.value === stored)
              ? stored
              : '';
    }
    set value(value: string) {
        if (this.getAttribute('value') !== value) {
            this.setAttribute('value', value);
        }
    }
    get disabled(): boolean {
        return this.hasAttribute('disabled');
    }
    set disabled(disabled: boolean) {
        this.toggleAttribute('disabled', disabled);
    }

    connect$(): Observable<void> {
        const trigger = requireElement(this.root, '.trigger', HTMLButtonElement);
        const editor = requireElement(this.root, '.editor', HTMLInputElement);
        const panel = requireChild(this.root, '.panel');
        const search = requireElement(this.root, '.search', HTMLInputElement);
        const list = requireChild(this.root, '.results');
        const config$ = new Observable<SelectAction>(subscriber => {
            const read = (): void => {
                const label =
                    this.getAttribute('aria-label') ??
                    this.closest('label')?.firstChild?.textContent?.trim() ??
                    'Select option';
                const config: SelectConfig = {
                    options: [...this.options].map(option => ({
                        value: option.value,
                        label: option.getAttribute('label') ?? option.textContent ?? '',
                        disabled: option.disabled,
                    })),
                    value: this.value,
                    disabled: this.disabled,
                    editable: this.hasAttribute('editable'),
                    label,
                    placeholder: this.getAttribute('placeholder') ?? '',
                };
                subscriber.next({ kind: 'config', config });
            };
            const observer = new MutationObserver(read);
            observer.observe(this, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true,
                attributeFilter: [
                    'value',
                    'label',
                    'disabled',
                    'selected',
                    'aria-label',
                    'placeholder',
                    'editable',
                ],
            });
            read();
            return () => observer.disconnect();
        });
        const keys$ = merge(
            fromElementEvent$(trigger, 'keydown'),
            fromElementEvent$(editor, 'keydown'),
            fromElementEvent$(search, 'keydown'),
        ).pipe(
            mergeMap(event => {
                const open = panel.matches(':popover-open');
                const inText = event.target === editor || event.target === search;
                const command =
                    ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key) ||
                    (open && ['Escape', 'Tab'].includes(event.key)) ||
                    (!inText && ['Home', 'End', ' '].includes(event.key));
                return event.isComposing || event.ctrlKey || event.metaKey || !command
                    ? []
                    : [{ event, action: { kind: 'key' as const, key: event.key } }];
            }),
            tap(({ event }) => {
                if (event.key !== 'Tab') {
                    event.preventDefault();
                    event.stopPropagation();
                }
            }),
            map(({ action }) => action),
        );
        const close$ = merge(
            fromDocumentEvent$('pointerdown').pipe(
                filter(event => !event.composedPath().includes(this)),
            ),
            fromDocumentEvent$('scroll').pipe(
                filter(event => !event.composedPath().includes(this)),
            ),
            fromEvent(window, 'resize'),
            fromEvent(window, 'blur'),
            fromElementEvent$(this, 'focusout').pipe(
                filter(
                    event =>
                        !(event.relatedTarget instanceof Node) ||
                        (!this.contains(event.relatedTarget) &&
                            !this.root.contains(event.relatedTarget)),
                ),
            ),
        ).pipe(map((): SelectAction => ({ kind: 'close', focus: false })));
        const session$ = merge(
            config$,
            fromElementEvent$(trigger, 'click').pipe(map((): SelectAction => ({ kind: 'toggle' }))),
            fromElementEvent$(editor, 'focus').pipe(
                map((): SelectAction => ({ kind: 'query', text: editor.value })),
            ),
            merge(fromElementEvent$(editor, 'input'), fromElementEvent$(search, 'input')).pipe(
                map(event => ({
                    event,
                    text: event.target === editor ? editor.value : search.value,
                })),
                tap(({ event }) => event.stopPropagation()),
                map(({ text }): SelectAction => ({ kind: 'query', text })),
            ),
            fromElementEvent$(list, 'click').pipe(
                mergeMap(({ target }): SelectAction[] => {
                    const option =
                        target instanceof Element ? target.closest('[data-value]') : null;
                    return option instanceof HTMLButtonElement &&
                        !option.disabled &&
                        option.dataset['value'] !== undefined
                        ? [{ kind: 'choose', value: option.dataset['value'] }]
                        : [];
                }),
            ),
            keys$,
            close$,
        ).pipe(scan(reduceSelect, emptySelect));
        return merge(
            this.rendering.lifetime$,
            merge(
                fromElementEvent$(list, 'pointerdown').pipe(tap(event => event.preventDefault())),
                session$.pipe(
                    map(session => ({
                        session,
                        placement: popupPlacement(this.getBoundingClientRect(), viewportSize()),
                        found: matchingOptions(session.config, session.query),
                    })),
                    tap(({ session, placement, found }) => {
                        const { config } = session;
                        const searching =
                            !config.editable &&
                            (config.options.length > 7 || this.hasAttribute('searchable'));
                        this.rendering.update({ session, found, placement, searching });
                        const opened = panel.matches(':popover-open');
                        if (session.open && this.isConnected && !opened) {
                            panel.showPopover();
                            if (searching) {
                                search.focus();
                            }
                        }
                        if (!session.open && opened) {
                            panel.hidePopover();
                        }
                        if (session.focus) {
                            (config.editable ? editor : trigger).focus();
                        }
                        const active = list.children[session.active];
                        if (session.open && active instanceof HTMLElement) {
                            const top = active.offsetTop - list.offsetTop;
                            if (top < list.scrollTop) {
                                list.scrollTop = top;
                            } else if (
                                top + active.offsetHeight >
                                list.scrollTop + list.clientHeight
                            ) {
                                list.scrollTop = top + active.offsetHeight - list.clientHeight;
                            }
                        }
                        if (session.write !== null) {
                            this.value = session.write;
                        }
                        if (session.chosen) {
                            this.dispatchEvent(
                                new Event('change', { bubbles: true, composed: true }),
                            );
                        }
                        if (session.submit) {
                            this.closest('form')?.requestSubmit();
                        }
                    }),
                ),
            ).pipe(
                map(() => undefined),
                finalize(() => {
                    if (panel.matches(':popover-open')) {
                        panel.hidePopover();
                    }
                }),
            ),
        );
    }
}

customElements.define('hks-select', HksSelect);

const sameControls = (a: readonly HksSelect[], b: readonly HksSelect[]): boolean =>
    a.length === b.length && a.every((control, index) => control === b[index]);

export const connectSelects$ = (root: ShadowRoot | HTMLElement): Observable<void> => {
    const controls$ = new Observable<readonly HksSelect[]>(subscriber => {
        const read = (): void =>
            subscriber.next(
                [...root.querySelectorAll('hks-select')].filter(
                    control => control instanceof HksSelect,
                ),
            );
        const observer = new MutationObserver(read);
        observer.observe(root, { childList: true, subtree: true });
        read();
        return () => observer.disconnect();
    }).pipe(distinctUntilChanged(sameControls), shareReplay({ bufferSize: 1, refCount: true }));
    return controls$.pipe(
        startWith<readonly HksSelect[]>([]),
        pairwise(),
        mergeMap(([before, current]) => current.filter(control => !before.includes(control))),
        mergeMap(control =>
            control
                .connect$()
                .pipe(takeUntil(controls$.pipe(filter(controls => !controls.includes(control))))),
        ),
    );
};
