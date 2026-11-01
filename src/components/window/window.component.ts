import { EMPTY, merge, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    ignoreElements,
    map,
    mergeMap,
    scan,
    share,
    startWith,
    tap,
} from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$, observeResize$ } from '../../lib/rx.ts';
import { pointerDelta$ } from '../../shared/drag.ts';
import {
    RESIZE_EDGES,
    type ResizeEdge,
    type StoreOption,
    type WindowGesture,
    type WindowView,
} from './frame.ts';
import css from './window.css?inline';

const sheet = styleSheet(css);
const SVG = 'http://www.w3.org/2000/svg';

const TEMPLATE = `
    <div class="title">
        <span class="glyph"></span>
        <span class="name"></span>
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
        <header class="stores-head">
            <span>State</span>
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
    </div>
`;

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

const sameView = (a: WindowView, b: WindowView): boolean =>
    a.kind === b.kind && a.frame === b.frame && a.focused === b.focused;

export class HksWindow extends HTMLElement {
    readonly gestures$: Observable<WindowGesture>;

    private readonly name: HTMLElement;
    private readonly glyph: HTMLElement;
    private readonly shadow: ShadowRoot;
    private readonly open$: Observable<boolean>;

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

        // Shared: the popover's visibility and its closing after a pick read one sequence of toggles.
        this.open$ = merge(
            fromElementEvent$(chip, 'click').pipe(map(() => 'toggle' as const)),
            fromDocumentEvent$('pointerdown').pipe(
                filter(event => !inside(event)),
                map(() => 'close' as const),
            ),
            fromDocumentEvent$('keydown').pipe(
                filter(({ key }) => key === 'Escape'),
                map(() => 'close' as const),
            ),
            fromElementEvent$(popover, 'click').pipe(
                filter(
                    ({ target }) =>
                        dataOf(target, 'bind') !== undefined ||
                        dataOf(target, 'copy') !== undefined,
                ),
                map(() => 'close' as const),
            ),
        ).pipe(
            scan((open: boolean, action) => (action === 'toggle' ? !open : false), false),
            startWith(false),
            distinctUntilChanged(),
            share(),
        );

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
    ): Observable<void> {
        const shadow = this.shadow;
        const chip = requireChild(shadow, '.store');
        const popover = requireChild(shadow, '.stores');
        const options = requireChild(shadow, '.options');

        return merge(
            stores$.pipe(
                tap(stores => {
                    const current = stores?.find(option => option.current);
                    chip.hidden = current === undefined;

                    if (stores === null || current === undefined) {
                        return;
                    }

                    chip.style.setProperty('--store', current.colour);
                    chip.title = `${current.name}: shared with ${current.users - 1} other window${current.users === 2 ? '' : 's'}`;
                    chip.toggleAttribute('data-shared', current.users > 1);

                    const label = chip.querySelector('.store-name');

                    if (label !== null) {
                        label.textContent = current.name;
                    }

                    // Not while a name is being typed: rebuilding the list would take the input away.
                    if (!(shadow.activeElement instanceof HTMLInputElement)) {
                        options.replaceChildren(...stores.map(optionOf));
                    }
                }),
            ),
            this.open$.pipe(
                tap(open => {
                    popover.hidden = !open;
                    chip.setAttribute('aria-expanded', String(open));
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
