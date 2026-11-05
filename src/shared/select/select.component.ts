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
} from './select.ts';
import css from './select.css?inline';

const sheet = styleSheet(css);

export class HksSelect extends HTMLElement {
    readonly changes$: Observable<string>;
    private readonly root: ShadowRoot;

    constructor() {
        super();
        this.root = this.attachShadow({ mode: 'open' });
        this.root.adoptedStyleSheets = [sheet];
        this.root.innerHTML = `<button class="trigger" type="button" role="combobox" aria-haspopup="listbox" aria-controls="choices" aria-expanded="false"><span class="label"></span><svg class="chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4"/></svg></button><input class="editor" role="combobox" aria-autocomplete="list" aria-controls="choices" aria-expanded="false" autocomplete="off" hidden /><div class="panel" popover="manual"><input class="search" type="search" autocomplete="off" /><div id="choices" class="results" role="listbox"></div><p class="empty" hidden>No matches</p></div>`;
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
                        label: option.label,
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
            fromElementEvent$(list, 'pointerdown').pipe(tap(event => event.preventDefault())),
            session$.pipe(
                map(session => ({
                    session,
                    placement: popupPlacement(this.getBoundingClientRect(), viewportSize()),
                    found: matchingOptions(session.config, session.query),
                })),
                tap(({ session, placement, found }) => {
                    const { config } = session;
                    trigger.hidden = config.editable;
                    editor.hidden = !config.editable;
                    trigger.disabled = config.disabled;
                    editor.disabled = config.disabled;
                    trigger.setAttribute('aria-label', config.label);
                    editor.setAttribute('aria-label', config.label);
                    editor.placeholder = config.placeholder;
                    requireChild(this.root, '.label').textContent =
                        config.options.find(option => option.value === config.value)?.label ??
                        config.placeholder;
                    const searching =
                        !config.editable &&
                        (config.options.length > 7 || this.hasAttribute('searchable'));
                    search.hidden = !searching;
                    search.setAttribute('aria-label', `search ${config.label}`);
                    if (search.value !== session.query) {
                        search.value = session.query;
                    }
                    if (editor.value !== (config.editable ? session.query : config.value)) {
                        editor.value = config.editable ? session.query : config.value;
                    }
                    trigger.setAttribute('aria-expanded', String(session.open));
                    editor.setAttribute('aria-expanded', String(session.open));
                    list.setAttribute('aria-label', config.label);
                    const signature = JSON.stringify(
                        found.map(option => [option.value, option.label, option.disabled]),
                    );
                    if (list.dataset['options'] !== signature) {
                        list.dataset['options'] = signature;
                        list.replaceChildren(
                            ...found.map((option, index) => {
                                const button = document.createElement('button');
                                button.type = 'button';
                                button.tabIndex = -1;
                                button.className = 'option';
                                button.id = `choice-${index}`;
                                button.dataset['value'] = option.value;
                                button.textContent = option.label;
                                button.disabled = option.disabled;
                                button.setAttribute('role', 'option');
                                return button;
                            }),
                        );
                    }
                    for (const [index, option] of [...list.children].entries()) {
                        option.setAttribute(
                            'aria-selected',
                            String(found[index]?.value === config.value),
                        );
                        option.toggleAttribute('data-active', index === session.active);
                    }
                    const control = config.editable ? editor : searching ? search : trigger;
                    for (const field of [editor, trigger, search]) {
                        if (session.open && session.active >= 0) {
                            field.setAttribute('aria-activedescendant', `choice-${session.active}`);
                        } else {
                            field.removeAttribute('aria-activedescendant');
                        }
                    }
                    requireChild(this.root, '.empty').hidden = found.length > 0;
                    panel.style.left = `${placement.left}px`;
                    panel.style.top = placement.top === null ? 'auto' : `${placement.top}px`;
                    panel.style.bottom =
                        placement.bottom === null ? 'auto' : `${placement.bottom}px`;
                    panel.style.width = `${placement.width}px`;
                    panel.style.maxHeight = `${placement.height}px`;
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
                        } else if (top + active.offsetHeight > list.scrollTop + list.clientHeight) {
                            list.scrollTop = top + active.offsetHeight - list.clientHeight;
                        }
                    }
                    if (session.write !== null) {
                        this.value = session.write;
                    }
                    if (session.chosen) {
                        this.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                    }
                    if (session.submit) {
                        this.closest('form')?.requestSubmit();
                    }
                    control.setAttribute('aria-controls', 'choices');
                }),
            ),
        ).pipe(
            map(() => undefined),
            finalize(() => {
                if (panel.matches(':popover-open')) {
                    panel.hidePopover();
                }
            }),
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
