import { combineLatest, EMPTY, merge, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    ignoreElements,
    map,
    mergeMap,
    scan,
    share,
    startWith,
    switchMap,
    take,
    tap,
} from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$, observeResize$ } from '../../lib/rx.ts';
import { pointerDelta$ } from '../../shared/drag.ts';
import {
    RESIZE_EDGES,
    type ResizeEdge,
    type FollowGroup,
    type StoreOption,
    type SwitchGroup,
    type SwitchItem,
    type WindowGesture,
    type WindowView,
} from './frame.ts';
import css from './window.css?inline';

const sheet = styleSheet(css);
const SVG = 'http://www.w3.org/2000/svg';

const TEMPLATE = `
    <div class="title">
        <span class="glyph"></span>
        <button class="name" type="button" aria-haspopup="true" aria-expanded="false" title="change program"></button>
        <button class="store" type="button" aria-haspopup="true" aria-expanded="false" hidden>
            <span class="dot"></span><span class="store-name"></span>
        </button>
        <button class="close" type="button" aria-label="quit">
            <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3.5 3.5 L8.5 8.5 M8.5 3.5 L3.5 8.5"/>
            </svg>
        </button>
    </div>
    <div class="body"><slot></slot></div>
    <div class="stores" role="dialog" aria-label="window state" hidden>
        <header class="stores-head" title="the state this window keeps: what it reads and writes">
            <span class="direction" aria-hidden="true">→</span>
            <span>Output</span>
            <button class="add connections" type="button" title="Show every connection on the canvas (state mode, or hold W)" aria-label="show connections">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M17 17 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M7 7 C13 7 11 17 17 17"/></svg>
            </button>
            <button class="add" type="button" data-copy="false" title="New empty state" aria-label="new empty state">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5 V19 M5 12 H19"/></svg>
            </button>
            <button class="add" type="button" data-copy="true" title="Fork: continue on a copy of this state" aria-label="fork this state into a copy">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="7" cy="5.5" r="2"/><circle cx="7" cy="18.5" r="2"/><circle cx="17" cy="5.5" r="2"/>
                    <path d="M7 7.5 V16.5 M17 7.5 C17 12 7 11 7 16.5"/>
                </svg>
            </button>
        </header>
        <ul class="options"></ul>
        <div class="follows"></div>
    </div>
    <div class="switcher" role="dialog" aria-label="change program" hidden>
        <header class="stores-head">
            <button class="back" type="button" aria-label="back to programs" title="back to programs" hidden>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 6 L8 12 L14 18"/></svg>
            </button>
            <span class="switch-title">Program</span>
            <button class="add switch-new" type="button" title="New empty state" aria-label="new empty state" hidden>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5 V19 M5 12 H19"/></svg>
            </button>
        </header>
        <div class="switch-list"></div>
    </div>
`;

// Further than this between press and click, and the press was a drag of the title, not a click on the name.
const CLICK_SLOP = 4;

type Switching =
    | { readonly step: 'closed' }
    | { readonly step: 'programs' }
    | { readonly step: 'stores'; readonly program: string };

type SwitchAction =
    | { readonly kind: 'toggle' }
    | { readonly kind: 'close' }
    | { readonly kind: 'pick'; readonly program: string }
    | { readonly kind: 'back' };

const reduceSwitching = (state: Switching, action: SwitchAction): Switching => {
    switch (action.kind) {
        case 'toggle':
            return state.step === 'closed' ? { step: 'programs' } : { step: 'closed' };
        case 'close':
            return { step: 'closed' };
        case 'pick':
            return { step: 'stores', program: action.program };
        case 'back':
            return { step: 'programs' };
    }
};

const SVG_NS = 'http://www.w3.org/2000/svg';

const switchRow = (
    label: string,
    meta: string,
    current: boolean,
    icon: string | null,
    colour: string | null,
): HTMLElement => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'pick switch-row';
    row.toggleAttribute('data-current', current);

    if (icon !== null) {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', icon);
        svg.append(path);
        row.append(svg);
    }

    if (colour !== null) {
        const dot = document.createElement('span');
        dot.className = 'dot';
        dot.style.setProperty('--store', colour);
        row.append(dot);
    }

    const name = document.createElement('span');
    name.className = 'option-name';
    name.textContent = label;

    const extra = document.createElement('span');
    extra.className = 'users';
    extra.textContent = meta;

    row.append(name, extra);

    return row;
};

const dataOf = (target: EventTarget | null, key: string): string | undefined => {
    const element = target instanceof Element ? target.closest(`[data-${key}]`) : null;

    return element instanceof HTMLElement ? element.dataset[key] : undefined;
};

const optionOf = ({ id, name, colour, users, current }: StoreOption): HTMLElement => {
    const row = document.createElement('li');
    row.className = 'option';
    row.toggleAttribute('data-current', current);

    // The current store is not a button: a click on it renames it, since switching to it would do nothing.
    const pick = document.createElement(current ? 'div' : 'button');
    pick.className = 'pick';

    if (pick instanceof HTMLButtonElement) {
        pick.type = 'button';
        pick.dataset['bind'] = id;
    }

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.setProperty('--store', colour);

    const label = document.createElement(current ? 'input' : 'span');
    label.className = 'option-name';

    if (label instanceof HTMLInputElement) {
        label.value = name;
        label.defaultValue = name;
        label.dataset['rename'] = id;
        label.autocomplete = 'off';
        label.title = 'rename';
        label.setAttribute('aria-label', 'name of this state');
    } else {
        label.textContent = name;
    }

    const count = document.createElement('span');
    count.className = 'users';
    count.textContent = users === 0 ? 'unused' : users === 1 ? '1 window' : `${users} windows`;

    pick.append(dot, label, count);
    row.append(pick);

    if (users === 0) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'remove';
        remove.dataset['remove'] = id;
        remove.textContent = '×';
        remove.setAttribute('aria-label', `delete ${name}`);
        row.append(remove);
    }

    return row;
};

const followRow = ({ id, name, colour, users, current }: StoreOption): HTMLElement => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'pick follow';
    row.dataset['followStore'] = id;
    row.toggleAttribute('data-current', current);
    row.setAttribute('aria-pressed', String(current));

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.setProperty('--store', colour);

    const label = document.createElement('span');
    label.className = 'option-name';
    label.textContent = name;

    const count = document.createElement('span');
    count.className = 'users';
    count.textContent = users === 0 ? 'unused' : users === 1 ? '1 window' : `${users} windows`;

    row.append(dot, label, count);

    return row;
};

const noneRow = (input: string, current: boolean): HTMLElement => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'pick follow none';
    row.dataset['unfollow'] = input;
    row.toggleAttribute('data-current', current);
    row.setAttribute('aria-pressed', String(current));

    const dot = document.createElement('span');
    dot.className = 'dot';

    const label = document.createElement('span');
    label.className = 'option-name';
    label.textContent = 'None';

    row.append(dot, label);

    return row;
};

const inputLine = (
    input: string,
    label: string,
    current: StoreOption | undefined,
    open: boolean,
): HTMLElement => {
    const line = document.createElement('button');
    line.type = 'button';
    line.className = 'input-line';
    line.dataset['expand'] = input;
    line.setAttribute('aria-expanded', String(open));
    line.title = open ? 'close the list' : `choose what ${label} follows`;

    const direction = document.createElement('span');
    direction.className = 'direction';
    direction.setAttribute('aria-hidden', 'true');
    direction.textContent = '←';

    const key = document.createElement('span');
    key.className = 'input-name';
    key.textContent = label;

    const dot = document.createElement('span');
    dot.className = 'dot';

    if (current === undefined) {
        dot.toggleAttribute('data-none', true);
    } else {
        dot.style.setProperty('--store', current.colour);
    }

    const value = document.createElement('span');
    value.className = 'option-name';
    value.textContent = current?.name ?? 'None';

    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.setAttribute('aria-hidden', 'true');

    line.append(direction, key, dot, value, chevron);

    return line;
};

const inputsView = (follows: readonly FollowGroup[], expanded: string | null): HTMLElement[] => {
    const inputs = [...new Set(follows.map(({ input }) => input))];

    if (inputs.length === 0) {
        return [];
    }

    const heading = document.createElement('p');
    heading.className = 'follow-title';
    heading.title = 'what this window reads from other state';
    heading.textContent = 'Inputs';

    return [
        heading,
        ...inputs.flatMap(input => {
            const groups = follows.filter(group => group.input === input);
            const current = groups
                .flatMap(({ options: list }) => list)
                .find(option => option.current);
            const open = expanded === input;
            const line = inputLine(input, groups[0]?.label ?? input, current, open);

            if (!open) {
                return [line];
            }

            const list = document.createElement('div');
            list.className = 'input-list';
            list.append(
                ...(groups[0]?.optional === true ? [noneRow(input, current === undefined)] : []),
                ...groups.flatMap(({ source, title, options: rows }) => [
                    ...(groups.length > 1
                        ? [
                              Object.assign(document.createElement('p'), {
                                  className: 'source-title',
                                  textContent: title,
                              }),
                          ]
                        : []),
                    ...rows.map(option => {
                        const row = followRow(option);
                        row.dataset['followInput'] = input;
                        row.dataset['followSource'] = source;

                        return row;
                    }),
                ]),
            );

            return [line, list];
        }),
    ];
};

const sameView = (a: WindowView, b: WindowView): boolean =>
    a.kind === b.kind && a.frame === b.frame && a.focused === b.focused;

export class HksWindow extends HTMLElement {
    readonly gestures$: Observable<WindowGesture>;

    private readonly name: HTMLElement;
    private readonly glyph: HTMLElement;
    private readonly shadow: ShadowRoot;
    private readonly expanded$: Observable<string | null>;
    readonly stateModes$: Observable<void>;
    // This window's own menu, apart from one opened from state mode, which alone keeps the mode on.
    readonly menus$: Observable<boolean>;
    private readonly switching$: Observable<SwitchAction>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        for (const edge of RESIZE_EDGES) {
            const handle = document.createElement('div');
            handle.className = `handle handle--${edge}`;
            shadow.appendChild(handle);
        }

        this.shadow = shadow;
        this.name = requireChild(shadow, '.name');
        this.glyph = requireChild(shadow, '.glyph');

        const chip = requireChild(shadow, '.store');
        const popover = requireChild(shadow, '.stores');
        const inside = (event: Event): boolean =>
            event.composedPath().includes(popover) || event.composedPath().includes(chip);

        const connections = requireChild(shadow, '.connections');

        this.menus$ = merge(
            fromElementEvent$(chip, 'click').pipe(map(() => 'toggle' as const)),
            fromElementEvent$(connections, 'click').pipe(map(() => 'close' as const)),
            fromDocumentEvent$('pointerdown').pipe(
                filter(event => !inside(event)),
                map(() => 'close' as const),
            ),
            fromDocumentEvent$('keydown').pipe(
                filter(({ key }) => key === 'Escape'),
                map(() => 'close' as const),
            ),
            // Not after + or fork: the new store's name is focused next, so it can be named straight away.
            fromElementEvent$(popover, 'click').pipe(
                filter(
                    ({ target }) =>
                        dataOf(target, 'bind') !== undefined ||
                        dataOf(target, 'follow-store') !== undefined,
                ),
                map(() => 'close' as const),
            ),
        ).pipe(
            scan((open: boolean, action) => (action === 'toggle' ? !open : false), false),
            startWith(false),
            distinctUntilChanged(),
            share(),
        );

        this.stateModes$ = fromElementEvent$(connections, 'click').pipe(map(() => undefined));

        this.expanded$ = merge(
            fromElementEvent$(popover, 'click').pipe(
                mergeMap(({ target }) => {
                    const input = dataOf(target, 'expand');

                    return input === undefined ? EMPTY : of({ kind: 'toggle' as const, input });
                }),
            ),
            fromElementEvent$(popover, 'click').pipe(
                filter(
                    ({ target }) =>
                        dataOf(target, 'follow-store') !== undefined ||
                        dataOf(target, 'unfollow') !== undefined,
                ),
                map(() => ({ kind: 'close' as const, input: null })),
            ),
            this.menus$.pipe(
                filter(open => !open),
                map(() => ({ kind: 'close' as const, input: null })),
            ),
        ).pipe(
            scan(
                (open: string | null, action): string | null =>
                    action.kind === 'toggle' && open !== action.input ? action.input : null,
                null,
            ),
            startWith(null),
            distinctUntilChanged(),
        );

        const name = this.name;
        const switcher = requireChild(shadow, '.switcher');
        const insideSwitcher = (event: Event): boolean =>
            event.composedPath().includes(switcher) || event.composedPath().includes(name);
        const rowOf = (target: EventTarget | null): HTMLElement | null => {
            const row =
                target instanceof Element ? target.closest('.switch-row, .switch-new') : null;

            return row instanceof HTMLElement ? row : null;
        };

        // Shared: the picker's steps and the replace it ends in read one sequence of clicks.
        this.switching$ = merge(
            merge(
                fromElementEvent$(name, 'pointerdown').pipe(
                    switchMap(down =>
                        // On the title, not the name: the drag captures the pointer there, and the click follows it.
                        fromElementEvent$(requireChild(shadow, '.title'), 'click').pipe(
                            take(1),
                            filter(
                                up =>
                                    Math.hypot(
                                        up.clientX - down.clientX,
                                        up.clientY - down.clientY,
                                    ) < CLICK_SLOP,
                            ),
                        ),
                    ),
                ),
                // A click from the keyboard has no press before it.
                fromElementEvent$(name, 'click').pipe(filter(({ detail }) => detail === 0)),
            ).pipe(map((): SwitchAction => ({ kind: 'toggle' }))),
            fromDocumentEvent$('pointerdown').pipe(
                filter(event => !insideSwitcher(event)),
                map((): SwitchAction => ({ kind: 'close' })),
            ),
            fromDocumentEvent$('keydown').pipe(
                filter(({ key }) => key === 'Escape'),
                map((): SwitchAction => ({ kind: 'close' })),
            ),
            fromElementEvent$(requireChild(shadow, '.back'), 'click').pipe(
                map((): SwitchAction => ({ kind: 'back' })),
            ),
            fromElementEvent$(switcher, 'click').pipe(
                mergeMap(({ target }): Observable<SwitchAction> => {
                    const row = rowOf(target);
                    const program = row?.dataset['program'];

                    if (row === null || program === undefined) {
                        return EMPTY;
                    }

                    return row.dataset['stateful'] === 'true' && row.dataset['store'] === undefined
                        ? of({ kind: 'pick', program })
                        : of({ kind: 'close' });
                }),
            ),
        ).pipe(share());

        const resize = (edge: ResizeEdge) =>
            pointerDelta$(requireChild(shadow, `.handle--${edge}`)).pipe(
                map(({ dx, dy }): WindowGesture => ({ kind: 'resize', edge, dx, dy })),
            );

        this.gestures$ = merge(
            pointerDelta$(requireChild(shadow, '.title')).pipe(
                map(({ dx, dy }): WindowGesture => ({ kind: 'move', dx, dy })),
            ),
            ...RESIZE_EDGES.map(resize),
            fromElementEvent$(this, 'pointerdown').pipe(
                map((): WindowGesture => ({ kind: 'raise' })),
            ),
            // The button sits inside the drag handle; its press must not also drag.
            fromElementEvent$(requireChild(shadow, '.close'), 'pointerdown').pipe(
                tap(event => {
                    event.stopPropagation();
                }),
                ignoreElements(),
            ),
            fromElementEvent$(requireChild(shadow, '.close'), 'click').pipe(
                map((): WindowGesture => ({ kind: 'quit' })),
            ),
            // The chip sits inside the drag handle too.
            fromElementEvent$(chip, 'pointerdown').pipe(
                tap(event => {
                    event.stopPropagation();
                }),
                ignoreElements(),
            ),
            fromElementEvent$(popover, 'click').pipe(
                mergeMap(({ target }): Observable<WindowGesture> => {
                    const input = dataOf(target, 'unfollow');

                    return input === undefined ? EMPTY : of({ kind: 'unfollow', input });
                }),
            ),
            fromElementEvent$(popover, 'click').pipe(
                mergeMap(({ target }): Observable<WindowGesture> => {
                    const row =
                        target instanceof Element ? target.closest('[data-follow-store]') : null;

                    return row instanceof HTMLElement &&
                        row.dataset['followStore'] !== undefined &&
                        row.dataset['followInput'] !== undefined &&
                        row.dataset['followSource'] !== undefined
                        ? of({
                              kind: 'follow',
                              input: row.dataset['followInput'],
                              source: row.dataset['followSource'],
                              store: row.dataset['followStore'],
                          })
                        : EMPTY;
                }),
            ),
            fromElementEvent$(popover, 'click').pipe(
                mergeMap(({ target }): Observable<WindowGesture> => {
                    const bind = dataOf(target, 'bind');
                    const remove = dataOf(target, 'remove');
                    const copy = dataOf(target, 'copy');

                    return bind !== undefined
                        ? of({ kind: 'bind-store', store: bind })
                        : remove !== undefined
                          ? of({ kind: 'remove-store', store: remove })
                          : copy !== undefined
                            ? of({ kind: 'add-store', copy: copy === 'true' })
                            : EMPTY;
                }),
            ),
            // The row carries what it stands for: the window holds no data about programs.
            fromElementEvent$(switcher, 'click').pipe(
                mergeMap(({ target }): Observable<WindowGesture> => {
                    const row = rowOf(target);
                    const program = row?.dataset['program'];

                    if (row === null || program === undefined) {
                        return EMPTY;
                    }

                    const store = row.dataset['store'];
                    const chosen = row.dataset['stateful'] !== 'true' || store !== undefined;
                    const minimum = {
                        width: Number(row.dataset['width'] ?? 0),
                        height: Number(row.dataset['height'] ?? 0),
                    };

                    return chosen
                        ? of({
                              kind: 'replace',
                              program,
                              store: store === '' || store === undefined ? null : store,
                              minimum,
                          })
                        : EMPTY;
                }),
            ),
            fromElementEvent$(popover, 'change').pipe(
                mergeMap(({ target }): Observable<WindowGesture> => {
                    const store =
                        target instanceof HTMLInputElement ? target.dataset['rename'] : undefined;

                    return target instanceof HTMLInputElement && store !== undefined
                        ? of({ kind: 'rename-store', store, name: target.value })
                        : EMPTY;
                }),
            ),
            // offset*, not getBoundingClientRect: the size in world units, before the zoom.
            observeResize$(this).pipe(
                map((): WindowGesture => ({
                    kind: 'measure',
                    width: this.offsetWidth,
                    height: this.offsetHeight,
                })),
            ),
        );
    }

    // An icon is path data on a 24x24 viewBox, built as nodes so it can never be markup.
    label(title: string, icon: string | null): this {
        this.name.textContent = title;

        if (icon === null) {
            this.glyph.replaceChildren();

            return this;
        }

        const svg = document.createElementNS(SVG, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');

        const path = document.createElementNS(SVG, 'path');
        path.setAttribute('d', icon);
        svg.append(path);
        this.glyph.replaceChildren(svg);

        return this;
    }

    connect$(
        view$: Observable<WindowView>,
        stores$: Observable<readonly StoreOption[] | null> = of(null),
        programs$: Observable<readonly SwitchGroup[] | null> = of(null),
        follows$: Observable<readonly FollowGroup[] | null> = of(null),
        manage$: Observable<boolean> = EMPTY,
    ): Observable<void> {
        const shadow = this.shadow;
        const chip = requireChild(shadow, '.store');
        const popover = requireChild(shadow, '.stores');
        const options = requireChild(shadow, '.options');
        const switcher = requireChild(shadow, '.switcher');
        const list = requireChild(shadow, '.switch-list');
        const back = requireChild(shadow, '.back');
        const fresh = requireChild(shadow, '.switch-new');
        const heading = requireChild(shadow, '.switch-title');
        const name = this.name;
        const sized = (row: HTMLElement, { id, minimum }: SwitchItem): HTMLElement => {
            row.dataset['program'] = id;
            row.dataset['width'] = String(minimum.width);
            row.dataset['height'] = String(minimum.height);

            return row;
        };

        return merge(
            combineLatest([
                this.switching$.pipe(
                    scan(reduceSwitching, { step: 'closed' }),
                    startWith<Switching>({ step: 'closed' }),
                ),
                programs$,
            ]).pipe(
                tap(([state, groups]) => {
                    const item =
                        state.step === 'stores'
                            ? groups
                                  ?.flatMap(({ items }) => items)
                                  .find(({ id }) => id === state.program)
                            : undefined;
                    const open = groups !== null && state.step !== 'closed';

                    name.toggleAttribute('data-switchable', groups !== null);
                    name.setAttribute('aria-expanded', String(open));
                    switcher.hidden = !open;

                    if (!open || groups === null) {
                        return;
                    }

                    back.hidden = item === undefined;
                    fresh.hidden = item === undefined;

                    if (item === undefined) {
                        heading.textContent = 'Program';
                        list.replaceChildren(
                            ...groups.flatMap(({ title, items }) => {
                                const label = document.createElement('p');
                                label.className = 'switch-group';
                                label.textContent = title;

                                return [
                                    label,
                                    ...items.map(entry => {
                                        const row = sized(
                                            switchRow(
                                                entry.title,
                                                entry.current ? 'open here' : '',
                                                entry.current,
                                                entry.icon,
                                                null,
                                            ),
                                            entry,
                                        );
                                        row.dataset['stateful'] = String(entry.stores !== null);

                                        return row;
                                    }),
                                ];
                            }),
                        );

                        return;
                    }

                    heading.textContent = item.title;
                    sized(fresh, item);
                    fresh.dataset['stateful'] = 'true';
                    fresh.dataset['store'] = '';
                    list.replaceChildren(
                        ...(item.stores ?? []).map(store => {
                            const row = sized(
                                switchRow(
                                    store.name,
                                    store.users === 0
                                        ? 'unused'
                                        : store.users === 1
                                          ? '1 window'
                                          : `${store.users} windows`,
                                    false,
                                    null,
                                    store.colour,
                                ),
                                item,
                            );
                            row.dataset['stateful'] = 'true';
                            row.dataset['store'] = store.id;

                            return row;
                        }),
                    );
                }),
            ),
            combineLatest([stores$, follows$, this.expanded$]).pipe(
                tap(([stores, follows, expanded]) => {
                    // A window with no store of its own shows the one it runs on: the dial shows its clock.
                    const current =
                        stores?.find(option => option.current) ??
                        follows
                            ?.flatMap(({ options: list }) => list)
                            .find(option => option.current);
                    chip.hidden = current === undefined;
                    popover.toggleAttribute('data-own', stores !== null);

                    if (current === undefined) {
                        return;
                    }

                    if (!(shadow.activeElement instanceof HTMLInputElement)) {
                        requireChild(shadow, '.follows').replaceChildren(
                            ...inputsView(follows ?? [], expanded),
                        );
                    }

                    chip.style.setProperty('--store', current.colour);
                    chip.title = `${current.name}: shared with ${current.users - 1} other window${current.users === 2 ? '' : 's'}`;
                    chip.toggleAttribute('data-shared', current.users > 1);

                    const label = chip.querySelector('.store-name');

                    if (label !== null) {
                        label.textContent = current.name;
                    }

                    // Not while a name is being typed: rebuilding the list would take the input away.
                    if (stores !== null && !(shadow.activeElement instanceof HTMLInputElement)) {
                        options.replaceChildren(...stores.map(optionOf));
                    }
                }),
            ),
            manage$.pipe(
                distinctUntilChanged(),
                tap(open => {
                    popover.hidden = !open;
                    chip.setAttribute('aria-expanded', String(open));
                }),
            ),
            // Captured, so the binding is read before the add is applied, whichever listener runs first.
            fromElementEvent$(popover, 'click', { capture: true }).pipe(
                filter(({ target }) => dataOf(target, 'copy') !== undefined),
                map(() => {
                    const name = options.querySelector('input.option-name');

                    return name instanceof HTMLInputElement ? name.dataset['rename'] : undefined;
                }),
                switchMap(was =>
                    stores$.pipe(
                        map(stores => stores?.find(option => option.current)?.id),
                        filter(id => id !== undefined && id !== was),
                        take(1),
                    ),
                ),
                tap(() => {
                    const name = options.querySelector('input.option-name');

                    if (name instanceof HTMLInputElement) {
                        name.focus();
                        name.select();
                    }
                }),
            ),
            fromElementEvent$(popover, 'keydown').pipe(
                tap(event => {
                    const { target } = event;

                    if (!(target instanceof HTMLInputElement)) {
                        return;
                    }

                    // Escape puts the old name back first, so the blur that follows changes nothing.
                    if (event.key === 'Escape') {
                        target.value = target.defaultValue;
                    }

                    if (event.key === 'Enter' || event.key === 'Escape') {
                        event.preventDefault();
                        target.blur();
                    }
                }),
            ),
            view$.pipe(
                distinctUntilChanged(sameView),
                tap(({ kind, frame, focused }) => {
                    this.toggleAttribute('data-focused', focused);
                    this.style.transform = `translate(${frame.x.toFixed(0)}px, ${frame.y.toFixed(0)}px)`;
                    this.style.zIndex = frame.z.toFixed(0);

                    if (kind === 'fitted') {
                        this.style.removeProperty('width');
                        this.style.removeProperty('height');

                        return;
                    }

                    this.style.width = `${frame.width.toFixed(0)}px`;
                    this.style.height = `${frame.height.toFixed(0)}px`;
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-window', HksWindow);
