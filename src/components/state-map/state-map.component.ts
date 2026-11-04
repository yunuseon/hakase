import { combineLatest, concat, merge, of, timer, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    scan,
    share,
    shareReplay,
    startWith,
    switchMap,
    tap,
} from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { pointerGesture$, type Phase } from '../../shared/drag.ts';
import {
    relatedTo,
    wireKey,
    wirePath,
    type Focus,
    type StateCommand,
    type GraphLayout,
    type PlacedPort,
    type PlacedStore,
    type PlacedWindow,
    type Inspected,
    type Point,
} from './state-map.ts';
import type { Row } from './rows.ts';
import css from './state-map.css?inline';

const sheet = styleSheet(css);
const SVG = 'http://www.w3.org/2000/svg';

const COPIED_MS = 1500;
const ARM_MS = 3000;

const TEMPLATE = `
    <div class="bar">
        <span class="hint">Click a state or a window to inspect it.</span>
        <button class="prune" type="button"></button>
    </div>
    <div class="graph">
        <div class="board">
            <svg class="wires" aria-hidden="true"><path class="rubber" /></svg>
            <div class="nodes"></div>
        </div>
    </div>
    <div class="inspect"></div>
`;

type Arming = { readonly armed: number | null; readonly fire: boolean };

const treeRow = (path: string): HTMLElement => {
    const row = document.createElement('div');
    row.className = 'tree-row';
    row.dataset['path'] = path;
    row.setAttribute('role', 'treeitem');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'toggle';
    row.append(toggle, span('tree-key'), span('tree-value'));

    return row;
};

const filledRow = (row: HTMLElement, { depth, key, kind, text, open }: Row): void => {
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
    const name = row.querySelector('.tree-key');
    const value = row.querySelector('.tree-value');

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

const sectionOf = (target: string): HTMLElement => {
    const section = document.createElement('section');
    section.className = 'section';
    section.dataset['target'] = target;

    const head = document.createElement('header');
    head.className = 'section-head';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy';
    copy.dataset['copy'] = target;
    copy.textContent = 'Copy JSON';
    head.append(span('dot'), span('section-title'), copy);

    const rows = document.createElement('div');
    rows.className = 'tree';
    rows.setAttribute('role', 'tree');
    section.append(head, rows);

    return section;
};

const filledSection = (section: HTMLElement, { title, name, colour, rows }: Inspected): void => {
    section.style.setProperty('--store', colour);
    const heading = section.querySelector('.section-title');

    if (heading !== null && heading.textContent !== `${title} · ${name}`) {
        heading.textContent = `${title} · ${name}`;
    }

    const tree = section.querySelector('.tree');

    if (!(tree instanceof HTMLElement)) {
        return;
    }

    const existing = new Map(
        [...tree.children]
            .filter(child => child instanceof HTMLElement)
            .map(child => [child.dataset['path'], child]),
    );
    const shown = rows.map(row => {
        const element = existing.get(row.path) ?? treeRow(row.path);
        filledRow(element, row);

        return element;
    });
    const current = [...tree.children];

    if (current.length !== shown.length || shown.some((row, index) => current[index] !== row)) {
        tree.replaceChildren(...shown);
    }
};

type End =
    | {
          readonly kind: 'store';
          readonly id: string;
          readonly program: string;
          readonly feeds: string | null;
      }
    | {
          readonly kind: 'port';
          readonly window: string;
          readonly input: string;
          readonly accepts: readonly string[];
          readonly cuttable: boolean;
      }
    | {
          readonly kind: 'own';
          readonly window: string;
          readonly program: string;
          readonly store: string;
      };

type Drag = {
    readonly phase: Phase;
    readonly start: End | null;
    readonly from: Point;
    readonly at: Point;
    readonly over: End | null;
};

const ENDS = '[data-store], [data-input], [data-own]';

const endOf = (target: EventTarget | null): End | null => {
    const element = target instanceof Element ? target.closest(ENDS) : null;

    if (!(element instanceof HTMLElement) || target instanceof HTMLButtonElement) {
        return null;
    }

    const { store, program, feeds, window, input, accepts, cuttable, own, current } =
        element.dataset;

    if (store !== undefined && program !== undefined) {
        return { kind: 'store', id: store, program, feeds: feeds ?? null };
    }

    if (own !== undefined && program !== undefined && current !== undefined) {
        return { kind: 'own', window: own, program, store: current };
    }

    return window !== undefined && input !== undefined && accepts !== undefined
        ? {
              kind: 'port',
              window,
              input,
              accepts: accepts.split(' '),
              cuttable: cuttable !== undefined,
          }
        : null;
};

const sameEnd = (a: End, b: End): boolean => {
    switch (a.kind) {
        case 'store':
            return b.kind === 'store' && a.id === b.id;
        case 'port':
            return b.kind === 'port' && a.window === b.window && a.input === b.input;
        case 'own':
            return b.kind === 'own' && a.window === b.window;
    }
};

const commandOf = (a: End, b: End | null): StateCommand | null => {
    if (b === null) {
        return a.kind === 'port' && a.cuttable
            ? { kind: 'disconnect', window: a.window, input: a.input }
            : null;
    }

    const [store, other] = a.kind === 'store' ? [a, b] : b.kind === 'store' ? [b, a] : [null, null];

    if (store === null || other === null) {
        return null;
    }

    if (other.kind === 'port') {
        return store.feeds !== null && other.accepts.includes(store.feeds)
            ? {
                  kind: 'connect',
                  window: other.window,
                  input: other.input,
                  source: store.feeds,
                  store: store.id,
              }
            : null;
    }

    return other.kind === 'own' && other.program === store.program && other.store !== store.id
        ? { kind: 'bind', window: other.window, store: store.id }
        : null;
};

// undefined: a press that says nothing about focus, like one on a jack, which starts a wire instead.
const focusAt = (target: EventTarget | null): Focus | null | undefined => {
    if (!(target instanceof Element) || target instanceof HTMLButtonElement) {
        return undefined;
    }

    if (target.closest('.jack') !== null) {
        return undefined;
    }

    const store = target.closest('.store');

    if (store instanceof HTMLElement && store.dataset['store'] !== undefined) {
        return { kind: 'store', id: store.dataset['store'] };
    }

    const window = target.closest('[data-window-node]');

    return window instanceof HTMLElement && window.dataset['windowNode'] !== undefined
        ? { kind: 'window', id: window.dataset['windowNode'] }
        : null;
};

const unfocused: Focus | null = null;

const LOCATE = 'M12 4 V7 M12 17 V20 M4 12 H7 M17 12 H20 M12 8 A4 4 0 1 1 12 16 A4 4 0 1 1 12 8';

const iconOf = (path: string): SVGSVGElement => {
    const icon = document.createElementNS(SVG, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.classList.add('icon');
    const shape = document.createElementNS(SVG, 'path');
    shape.setAttribute('d', path);
    icon.append(shape);

    return icon;
};

const span = (className: string, text = ''): HTMLSpanElement => {
    const element = document.createElement('span');
    element.className = className;
    element.textContent = text;

    return element;
};

const placed = (element: HTMLElement, x: number, y: number, height: number): HTMLElement => {
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.height = `${height}px`;

    return element;
};

const storeNode = ({
    id,
    global,
    program,
    kind,
    title,
    name,
    colour,
    x,
    y,
    height,
}: PlacedStore) => {
    const node = placed(document.createElement('div'), x, y, height);
    node.className = 'node store';
    node.dataset['store'] = id;
    node.dataset['program'] = program;
    node.toggleAttribute('data-global', global);

    if (kind !== null) {
        node.dataset['feeds'] = kind;
    }

    node.style.setProperty('--store', colour);
    node.title = global
        ? `${name}: state of the whole app; click to inspect it`
        : `${title} · ${name}: click to inspect it, drag its jack onto a window to bind or follow it`;

    const label = span('label');
    label.append(span('kind', title), span('name', name));
    node.append(span('dot'), label, span('jack'));

    return node;
};

const portRow = (window: string, { input, title, accepts, optional, bound }: PlacedPort) => {
    const row = document.createElement('div');
    row.className = 'port';
    row.dataset['window'] = window;
    row.dataset['input'] = input;
    row.dataset['accepts'] = accepts.join(' ');
    row.toggleAttribute('data-bound', bound !== null);
    row.toggleAttribute('data-cuttable', optional && bound !== null);
    row.append(span('jack'), span('title', title));

    if (optional && bound !== null) {
        const cut = document.createElement('button');
        cut.type = 'button';
        cut.className = 'cut';
        cut.dataset['cut'] = '';
        cut.textContent = '×';
        cut.setAttribute('aria-label', `stop ${title} following`);
        row.append(cut);
    }

    return row;
};

const windowNode = ({ id, program, label, icon, own, ports, x, y, height }: PlacedWindow) => {
    const node = placed(document.createElement('div'), x, y, height);
    node.className = 'node window';
    node.dataset['windowNode'] = id;

    const head = document.createElement('div');
    head.className = 'head';
    head.append(iconOf(icon), span('label', label));

    if (own !== null) {
        head.dataset['own'] = id;
        head.dataset['program'] = program;
        head.dataset['current'] = own;
        head.prepend(span('jack'));
    }

    const locate = document.createElement('button');
    locate.type = 'button';
    locate.className = 'locate';
    locate.dataset['locate'] = id;
    locate.title = `fly to ${label}`;
    locate.setAttribute('aria-label', `fly to ${label}`);
    locate.append(iconOf(LOCATE));
    head.append(locate);

    node.append(head, ...ports.map(port => portRow(id, port)));

    return node;
};

export class HksStateMap extends HTMLElement {
    readonly commands$: Observable<StateCommand>;
    readonly focus$: Observable<Focus | null>;
    // A branch of an inspected state, as its target and its path, so two states never share one.
    readonly toggles$: Observable<{ readonly target: string; readonly path: string }>;
    readonly copies$: Observable<string>;

    private readonly shadow: ShadowRoot;
    private readonly drags$: Observable<Drag>;
    private readonly arming$: Observable<Arming>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        const board = requireChild(shadow, '.board');
        // Through the board's own scale: the canvas zoom shrinks its rect but not its layout.
        const local = (clientX: number, clientY: number): Point => {
            const rect = board.getBoundingClientRect();
            const scale = rect.width === 0 ? 1 : board.offsetWidth / rect.width;

            return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
        };
        const jackOf = (target: EventTarget | null): Point | null => {
            const element = target instanceof Element ? target.closest(ENDS) : null;
            const jack = element?.querySelector(':scope > .jack') ?? element;

            if (!(jack instanceof HTMLElement)) {
                return null;
            }

            const rect = jack.getBoundingClientRect();

            return local(rect.left + rect.width / 2, rect.top + rect.height / 2);
        };

        // Shared: the drawn wire and the command it ends in must read one gesture.
        this.drags$ = pointerGesture$(
            board,
            ({ target }) =>
                target instanceof Element &&
                target.closest('.jack') !== null &&
                endOf(target) !== null,
        ).pipe(
            scan(
                (drag: Drag, { phase, event }): Drag => {
                    const at = local(event.clientX, event.clientY);
                    const over = endOf(shadow.elementFromPoint(event.clientX, event.clientY));

                    return phase === 'grab'
                        ? {
                              phase,
                              start: endOf(event.target),
                              from: jackOf(event.target) ?? at,
                              at,
                              over: null,
                          }
                        : { ...drag, phase, at, over };
                },
                {
                    phase: 'release',
                    start: null,
                    from: { x: 0, y: 0 },
                    at: { x: 0, y: 0 },
                    over: null,
                },
            ),
            share(),
        );

        this.focus$ = fromElementEvent$(board, 'pointerdown').pipe(
            mergeMap(({ target }): (Focus | null)[] => {
                const focus = focusAt(target);

                return focus === undefined ? [] : [focus];
            }),
            startWith(unfocused),
            // Replayed: the map fades by it and the program inspects by it, and both must see the same one.
            shareReplay({ bufferSize: 1, refCount: true }),
        );

        const inspect = requireChild(shadow, '.inspect');

        this.toggles$ = fromElementEvent$(inspect, 'click').pipe(
            mergeMap(({ target }) => {
                const row = target instanceof Element ? target.closest('.tree-row') : null;
                const section = row?.closest('[data-target]');
                const path = row instanceof HTMLElement ? row.dataset['path'] : undefined;
                const owner =
                    section instanceof HTMLElement ? section.dataset['target'] : undefined;

                return path === undefined ||
                    owner === undefined ||
                    row?.querySelector('.toggle[hidden]') !== null
                    ? []
                    : [{ target: owner, path }];
            }),
        );
        this.copies$ = fromElementEvent$(inspect, 'click').pipe(
            mergeMap(({ target }) => {
                const button = target instanceof Element ? target.closest('[data-copy]') : null;
                const owner = button instanceof HTMLElement ? button.dataset['copy'] : undefined;

                return owner === undefined ? [] : [owner];
            }),
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

        this.commands$ = merge(
            this.arming$.pipe(
                filter(({ fire }) => fire),
                map((): StateCommand => ({ kind: 'prune' })),
            ),
            this.drags$.pipe(
                filter(({ phase }) => phase === 'release'),
                mergeMap(({ start, over }) => {
                    const command = start === null ? null : commandOf(start, over);

                    return command === null ? [] : [command];
                }),
            ),
            fromElementEvent$(board, 'click').pipe(
                mergeMap(({ target }): StateCommand[] => {
                    const cut = target instanceof Element ? target.closest('[data-cut]') : null;
                    const port = cut?.closest('[data-input]');

                    return port instanceof HTMLElement &&
                        port.dataset['window'] !== undefined &&
                        port.dataset['input'] !== undefined
                        ? [
                              {
                                  kind: 'disconnect',
                                  window: port.dataset['window'],
                                  input: port.dataset['input'],
                              },
                          ]
                        : [];
                }),
            ),
            fromElementEvent$(board, 'click').pipe(
                mergeMap(({ target }): StateCommand[] => {
                    const button =
                        target instanceof Element ? target.closest('[data-locate]') : null;

                    return button instanceof HTMLElement && button.dataset['locate'] !== undefined
                        ? [{ kind: 'locate', window: button.dataset['locate'] }]
                        : [];
                }),
            ),
        );
    }

    connect$(
        layout$: Observable<GraphLayout>,
        inspected$: Observable<readonly Inspected[]>,
        unused$: Observable<number>,
        copied$: Observable<{ readonly target: string; readonly text: string }>,
    ): Observable<void> {
        const inspect = requireChild(this.shadow, '.inspect');
        const prune = requireElement(this.shadow, '.prune', HTMLButtonElement);

        const shownInspection$ = inspected$.pipe(
            tap(list => {
                const existing = new Map(
                    [...inspect.children]
                        .filter(child => child instanceof HTMLElement)
                        .map(child => [child.dataset['target'], child]),
                );
                const sections = list.map(item => {
                    const section = existing.get(item.target) ?? sectionOf(item.target);
                    filledSection(section, item);

                    return section;
                });
                const current = [...inspect.children];

                if (
                    current.length !== sections.length ||
                    sections.some((section, index) => current[index] !== section)
                ) {
                    inspect.replaceChildren(...sections);
                }

                this.toggleAttribute('data-inspecting', list.length > 0);
            }),
        );

        const pruning$ = combineLatest([
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
                    count === 0
                        ? ''
                        : 'deletes every state no window keeps or follows, with its data';
            }),
        );

        const copying$ = copied$.pipe(
            tap(({ text }) => {
                void navigator.clipboard?.writeText(text).catch(() => undefined);
            }),
            switchMap(({ target }) => concat(of(target), timer(COPIED_MS).pipe(map(() => null)))),
            tap(target => {
                for (const button of inspect.querySelectorAll('[data-copy]')) {
                    if (button instanceof HTMLElement) {
                        button.textContent =
                            button.dataset['copy'] === target ? 'Copied' : 'Copy JSON';
                    }
                }
            }),
        );

        return merge(this.mapped$(layout$), shownInspection$, pruning$, copying$).pipe(
            map(() => undefined),
        );
    }

    private mapped$(layout$: Observable<GraphLayout>): Observable<unknown> {
        const shadow = this.shadow;
        const board = requireChild(shadow, '.board');
        const nodes = requireChild(shadow, '.nodes');
        const wires = requireElement(shadow, '.wires', SVGSVGElement);
        const rubber = requireElement(shadow, '.rubber', SVGPathElement);

        const drawn$ = layout$.pipe(
            tap(({ width, height, stores, windows, wires: list }) => {
                board.style.width = `${width}px`;
                board.style.height = `${height}px`;
                wires.setAttribute('width', String(width));
                wires.setAttribute('height', String(height));

                const paths = list.map(({ kind, window, input, path, colour, removable }) => {
                    const wire = document.createElementNS(SVG, 'path');
                    wire.classList.add('wire', kind);
                    wire.dataset['key'] = wireKey({ window, input });
                    wire.toggleAttribute('data-fixed', !removable);
                    wire.setAttribute('d', path);
                    wire.style.setProperty('--store', colour);

                    return wire;
                });
                wires.replaceChildren(...paths, rubber);
                nodes.replaceChildren(...stores.map(storeNode), ...windows.map(windowNode));
            }),
        );

        const dragged$ = this.drags$.pipe(
            tap(({ phase, start, from, at, over }) => {
                const live = phase !== 'release' && start !== null;
                rubber.setAttribute('d', live ? wirePath(from, at) : '');
                board.toggleAttribute('data-dragging', live);

                for (const element of shadow.querySelectorAll(ENDS)) {
                    const end = endOf(element);
                    const ok =
                        live && start !== null && end !== null && commandOf(start, end) !== null;
                    element.toggleAttribute('data-ok', ok);
                    element.toggleAttribute(
                        'data-over',
                        ok && end !== null && over !== null && sameEnd(end, over),
                    );
                }
            }),
        );

        // Together, so a redrawn graph keeps the focus and a focus never reads a graph about to be replaced.
        const focused$ = combineLatest([drawn$, this.focus$]).pipe(
            tap(([layout, focus]) => {
                const shown =
                    focus !== null &&
                    (focus.kind === 'window'
                        ? layout.windows.some(({ id }) => id === focus.id)
                        : layout.stores.some(({ id }) => id === focus.id));
                const related = shown ? relatedTo(layout, focus) : null;
                board.toggleAttribute('data-focus', related !== null);

                for (const element of shadow.querySelectorAll('[data-store]')) {
                    if (element instanceof HTMLElement) {
                        const id = element.dataset['store'] ?? '';
                        element.toggleAttribute('data-related', related?.stores.has(id) === true);
                        element.toggleAttribute(
                            'data-selected',
                            focus?.kind === 'store' && focus.id === id,
                        );
                    }
                }

                for (const element of shadow.querySelectorAll('[data-window-node]')) {
                    if (element instanceof HTMLElement) {
                        const id = element.dataset['windowNode'] ?? '';
                        element.toggleAttribute('data-related', related?.windows.has(id) === true);
                        element.toggleAttribute(
                            'data-selected',
                            focus?.kind === 'window' && focus.id === id,
                        );
                    }
                }

                for (const element of wires.querySelectorAll('.wire')) {
                    if (element instanceof SVGElement) {
                        element.toggleAttribute(
                            'data-related',
                            related?.wires.has(element.dataset['key'] ?? '') === true,
                        );
                    }
                }
            }),
        );

        return merge(focused$, dragged$);
    }
}

customElements.define('hks-state-map', HksStateMap);
