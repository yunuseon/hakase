import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html, svg } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { when } from 'lit-html/directives/when.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { withValue } from '../../lib/lit.ts';

import { mountView, renderView, type RenderView, type Rendering } from '../../lib/lit.ts';
import {
    commandOf,
    sameEnd,
    wirePath,
    type End,
    type StateCommand,
} from '../../shared/connections.ts';
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
    withLatestFrom,
} from 'rxjs/operators';
import { remScale, requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$, observeResize$, remScale$ } from '../../lib/rx.ts';
import { notTouch, pointerGesture$, touchGesture$, type Phase } from '../../shared/drag.ts';
import { wheelGesture, type ViewGesture } from '../../shared/wheel.ts';
import {
    closesLoop,
    nodeKey,
    relatedTo,
    wireKey,
    type Focus,
    type GraphLayout,
    type PlacedPort,
    type PlacedStore,
    type PlacedWindow,
    type Inspected,
    type Point,
} from './state-map.ts';
import css from './state-map.css?inline';

const sheet = styleSheet(css);

const COPIED_MS = 1500;
const ARM_MS = 3000;

const TEMPLATE = () =>
    html`<div class="bar">
            <span class="hint">Click a state or a window to inspect it.</span
            ><button
                class="tool"
                data-tool="tidy"
                type="button"
                title="put every node back where the map would place it"
            >
                Tidy</button
            ><button class="tool" data-tool="fit" type="button" title="frame the whole map">
                Fit</button
            ><button class="prune" type="button"></button>
        </div>
        <div class="graph">
            <div class="board">
                <svg class="wires" aria-hidden="true"><path class="rubber"></path></svg>
                <div class="nodes"></div>
            </div>
        </div>
        <div class="inspect"></div>`;

type Arming = { readonly armed: number | null; readonly fire: boolean };

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

    const { store, program, feeds, sink, owner, input, accepts, cuttable, own, current } =
        element.dataset;

    if (store !== undefined && program !== undefined) {
        return { kind: 'store', id: store, program, feeds: feeds ?? null };
    }

    if (own !== undefined && program !== undefined && current !== undefined) {
        return { kind: 'own', window: own, program, store: current };
    }

    return sink !== undefined && input !== undefined && accepts !== undefined
        ? {
              kind: 'port',
              owner: owner === 'store' ? 'store' : 'window',
              sink,
              input,
              accepts: accepts.split(' '),
              cuttable: cuttable !== undefined,
          }
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

const PortRow = (props: {
    readonly owner: 'window' | 'store';
    readonly sink: string;
    readonly port: PlacedPort;
}) =>
    html`<div
        class="port"
        data-owner=${ifDefined(props.owner)}
        data-sink=${ifDefined(props.sink)}
        data-input=${ifDefined(props.port.input)}
        data-accepts=${ifDefined(props.port.accepts.join(' '))}
        data-bound=${ifDefined(props.port.bound !== null ? '' : undefined)}
        data-cuttable=${ifDefined(props.port.optional && props.port.bound !== null ? '' : undefined)}
    >
        <span class="jack"></span
        ><span class="title">${props.port.title}</span
        >${when(props.port.optional && props.port.bound !== null, () => html`<button type="button" class="cut" data-cut="" aria-label=${ifDefined(`stop ${props.port.title} following`)}>×</button>`)}
    </div>`;
const StoreNode = (props: { readonly store: PlacedStore }) =>
    html`<div
        class="node store"
        data-store=${ifDefined(props.store.id)}
        data-program=${ifDefined(props.store.program)}
        data-global=${ifDefined(props.store.global ? '' : undefined)}
        data-feeds=${ifDefined(props.store.kind ?? undefined)}
        style=${styleMap({
            left: `${props.store.x}px`,
            top: `${props.store.y}px`,
            height: `${props.store.height}px`,
            '--store': props.store.colour,
        })}
        title=${ifDefined(
            props.store.global
                ? `${props.store.name}: state of the whole app; click to inspect it`
                : `${props.store.title} · ${props.store.name}: click to inspect it, drag its jack onto a window to bind or follow it`,
        )}
    >
        <div class="store-head">
            <span class="dot"></span
            ><span class="label"
                ><span class="kind">${props.store.title}</span
                ><span class="name">${props.store.name}</span></span
            ><span class="jack"></span>
        </div>
        ${repeat(
            props.store.ports.map(port => port.input),
            item => item,
            input =>
                withValue(
                    props.store.ports.find(port => port.input === input),
                    port => PortRow({ owner: 'store', sink: props.store.id, port: port }),
                ),
        )}
    </div>`;
const WindowNode = (props: { readonly window: PlacedWindow }) =>
    html`<div
        class="node window"
        data-window-node=${ifDefined(props.window.id)}
        style=${styleMap({
            left: `${props.window.x}px`,
            top: `${props.window.y}px`,
            height: `${props.window.height}px`,
        })}
    >
        <div
            class="head"
            data-own=${ifDefined(props.window.own !== null ? props.window.id : undefined)}
            data-program=${ifDefined(props.window.own !== null ? props.window.program : undefined)}
            data-current=${ifDefined(props.window.own ?? undefined)}
        >
            ${when(props.window.own !== null, () => html`<span class="jack"></span>`)}<svg
                class="icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
            >
                <path d=${ifDefined(props.window.icon)}></path></svg
            ><span class="label">${props.window.label}</span
            ><button
                type="button"
                class="locate"
                data-locate=${ifDefined(props.window.id)}
                title=${ifDefined(`fly to ${props.window.label}`)}
                aria-label=${ifDefined(`fly to ${props.window.label}`)}
            >
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d=${ifDefined(LOCATE)}></path>
                </svg>
            </button>
        </div>
        ${repeat(
            props.window.ports.map(port => port.input),
            item => item,
            input =>
                withValue(
                    props.window.ports.find(port => port.input === input),
                    port => PortRow({ owner: 'window', sink: props.window.id, port: port }),
                ),
        )}
    </div>`;

export class HksStateMap extends HTMLElement {
    readonly commands$: Observable<StateCommand>;
    readonly focus$: Observable<Focus | null>;
    // A branch of an inspected state, as its target and its path, so two states never share one.
    readonly toggles$: Observable<{ readonly target: string; readonly path: string }>;
    readonly copies$: Observable<string>;
    readonly moves$: Observable<{
        readonly node: string;
        readonly dx: number;
        readonly dy: number;
    }>;
    readonly views$: Observable<ViewGesture>;
    readonly fits$: Observable<{ readonly width: number; readonly height: number }>;
    readonly tidies$: Observable<void>;
    readonly sizes$: Observable<{ readonly width: number; readonly height: number }>;

    private readonly shadow: ShadowRoot;
    private readonly drags$: Observable<Drag>;
    private readonly arming$: Observable<Arming>;

    private readonly rendering: Rendering;

    private readonly inspectionView: RenderView<readonly Inspected[]>;
    private readonly nodeView: RenderView<GraphLayout | null>;
    private readonly wireView: RenderView<GraphLayout['wires']>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());
        this.inspectionView = renderView<readonly Inspected[]>(
            requireChild(shadow, '.inspect'),
            [],
            entries =>
                repeat(
                    entries.map(entry => entry.target),
                    item => item,
                    target =>
                        withValue(
                            entries.find(entry => entry.target === target),
                            entry =>
                                html`<section
                                    class="section"
                                    data-target=${ifDefined(target)}
                                    style=${styleMap({ '--store': entry.colour })}
                                >
                                    <header class="section-head">
                                        <span class="dot"></span
                                        ><span class="section-title"
                                            >${`${entry.title} · ${entry.name}`}</span
                                        ><button
                                            type="button"
                                            class="copy"
                                            data-copy=${ifDefined(target)}
                                        >
                                            Copy JSON
                                        </button>
                                    </header>
                                    <div class="tree" role="tree">
                                        ${repeat(
                                            entry.rows.map(row => row.path),
                                            item => item,
                                            path =>
                                                withValue(
                                                    entry.rows.find(row => row.path === path),
                                                    row =>
                                                        html`<div
                                                            class="tree-row"
                                                            data-path=${ifDefined(path)}
                                                            role="treeitem"
                                                            style=${styleMap({
                                                                '--depth': String(row.depth),
                                                            })}
                                                            data-kind=${ifDefined(row.kind)}
                                                            data-open=${ifDefined(row.open ? '' : undefined)}
                                                            aria-expanded=${ifDefined(
                                                                row.kind === 'object' ||
                                                                    row.kind === 'array'
                                                                    ? row.open
                                                                    : undefined,
                                                            )}
                                                        >
                                                            <button
                                                                type="button"
                                                                class="toggle"
                                                                ?hidden=${
                                                                    row.kind !== 'object' &&
                                                                    row.kind !== 'array'
                                                                }
                                                                aria-label=${ifDefined(`${row.open ? 'collapse' : 'expand'} ${row.key}`)}
                                                            ></button
                                                            ><span class="tree-key">${row.key}</span
                                                            ><span class="tree-value"
                                                                >${row.text}</span
                                                            >
                                                        </div>`,
                                                ),
                                        )}
                                    </div>
                                </section>`,
                        ),
                ),
        );
        this.nodeView = renderView<GraphLayout | null>(
            requireChild(shadow, '.nodes'),
            null,
            layout =>
                html`${repeat(
                    layout?.stores.map(store => store.id) ?? [],
                    item => item,
                    id =>
                        withValue(
                            layout?.stores.find(store => store.id === id),
                            store => StoreNode({ store: store }),
                        ),
                )}${repeat(
                    layout?.windows.map(window => window.id) ?? [],
                    item => item,
                    id =>
                        withValue(
                            layout?.windows.find(window => window.id === id),
                            window => WindowNode({ window: window }),
                        ),
                )}`,
        );
        this.wireView = renderView<GraphLayout['wires']>(
            requireElement(shadow, '.wires', SVGSVGElement),
            [],
            wires =>
                html`${repeat(
                        wires.map(wire => wireKey(wire)),
                        item => item,
                        key =>
                            withValue(
                                wires.find(wire => wireKey(wire) === key),
                                wire =>
                                    svg`<path class=${ifDefined(`wire ${wire.kind}`)} data-key=${ifDefined(key)} data-fixed=${ifDefined(!wire.removable ? '' : undefined)} d=${ifDefined(wire.path)} style=${styleMap({ '--store': wire.colour })}></path>`,
                            ),
                    )}<path class="rubber"></path>`,
        );

        const board = requireChild(shadow, '.board');
        const graph = requireChild(shadow, '.graph');
        // Through the board's own scale: the canvas zoom shrinks its rect but not its layout.
        const local = (clientX: number, clientY: number): Point => {
            const rect = board.getBoundingClientRect();
            const scale = rect.width === 0 ? 1 : board.offsetWidth / rect.width;

            return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
        };
        const jackOf = (target: EventTarget | null): Point | null => {
            const element = target instanceof Element ? target.closest(ENDS) : null;
            const jack =
                element?.querySelector(':scope > .jack, :scope > .store-head > .jack') ?? element;

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

        this.focus$ = fromElementEvent$(graph, 'pointerdown').pipe(
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

        // In the camera's units: the canvas zoom shrinks the rect but not the layout, and the board is drawn rem-scaled.
        const viewport = (clientX: number, clientY: number): Point => {
            const rect = graph.getBoundingClientRect();
            const scale = (rect.width === 0 ? 1 : graph.offsetWidth / rect.width) / remScale();

            return { x: (clientX - rect.left) * scale, y: (clientY - rect.top) * scale };
        };
        const nodeOf = (target: EventTarget | null) => {
            const node = target instanceof Element ? target.closest('.node') : null;

            if (!(node instanceof HTMLElement)) {
                return null;
            }

            const { store, windowNode } = node.dataset;

            return store !== undefined
                ? nodeKey('store', store)
                : windowNode !== undefined
                  ? nodeKey('window', windowNode)
                  : null;
        };
        const free = (target: EventTarget | null) =>
            target instanceof Element &&
            target.closest('.jack') === null &&
            target.closest('button') === null;

        type Held = { readonly node: string | null; readonly at: Point; readonly by: Point | null };

        this.moves$ = pointerGesture$(
            board,
            ({ target }) => free(target) && nodeOf(target) !== null,
        ).pipe(
            scan(
                (held: Held, { phase, event }): Held => {
                    const at = local(event.clientX, event.clientY);

                    return phase === 'grab'
                        ? { node: nodeOf(event.target), at, by: null }
                        : { ...held, at, by: { x: at.x - held.at.x, y: at.y - held.at.y } };
                },
                { node: null, at: { x: 0, y: 0 }, by: null },
            ),
            mergeMap(({ node, by }) =>
                node === null || by === null ? [] : [{ node, dx: by.x, dy: by.y }],
            ),
        );

        this.views$ = merge(
            pointerGesture$(
                graph,
                event => notTouch(event) && free(event.target) && nodeOf(event.target) === null,
            ).pipe(
                scan(
                    (held: Held, { phase, event }): Held => {
                        const at = viewport(event.clientX, event.clientY);

                        return phase === 'grab'
                            ? { node: null, at, by: null }
                            : { ...held, at, by: { x: at.x - held.at.x, y: at.y - held.at.y } };
                    },
                    { node: null, at: { x: 0, y: 0 }, by: null },
                ),
                mergeMap(({ by }): ViewGesture[] =>
                    by === null ? [] : [{ kind: 'pan', dx: by.x, dy: by.y }],
                ),
            ),
            touchGesture$(
                graph,
                ({ target }) => free(target) && nodeOf(target) === null,
                event => viewport(event.clientX, event.clientY),
                true,
            ),
            fromElementEvent$(graph, 'wheel', { passive: false }).pipe(
                mergeMap(event => {
                    const gesture = wheelGesture({
                        deltaX: event.deltaX,
                        deltaY: event.deltaY,
                        lines: event.deltaMode === WheelEvent.DOM_DELTA_LINE,
                        pinch: event.ctrlKey || event.metaKey,
                        onGround: true,
                        at: viewport(event.clientX, event.clientY),
                    });

                    return gesture === null ? [] : [{ event, claimed: gesture }];
                }),
                // Claimed, so the canvas behind leaves this wheel to the map, as the frame strip's.
                tap(({ event }) => {
                    event.preventDefault();
                }),
                map(({ claimed }) => claimed),
            ),
        );

        const tool = (name: string) =>
            fromElementEvent$(requireChild(shadow, `[data-tool="${name}"]`), 'click');

        this.fits$ = tool('fit').pipe(
            map(() => ({
                width: graph.clientWidth / remScale(),
                height: graph.clientHeight / remScale(),
            })),
        );
        this.tidies$ = tool('tidy').pipe(map(() => undefined));
        this.sizes$ = observeResize$(graph).pipe(
            map(() => ({
                width: graph.clientWidth / remScale(),
                height: graph.clientHeight / remScale(),
            })),
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
                    const end = endOf(cut?.closest('[data-input]') ?? null);
                    const command = end === null ? null : commandOf(end, null);

                    return command === null ? [] : [command];
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
        camera$: Observable<{ readonly x: number; readonly y: number; readonly zoom: number }>,
        inspected$: Observable<readonly Inspected[]>,
        unused$: Observable<number>,
        copied$: Observable<{ readonly target: string; readonly text: string }>,
    ): Observable<void> {
        const inspect = requireChild(this.shadow, '.inspect');
        const board = requireChild(this.shadow, '.board');
        const prune = requireElement(this.shadow, '.prune', HTMLButtonElement);

        const shownInspection$ = inspected$.pipe(
            tap(list => {
                this.inspectionView.update(list);
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

        const viewed$ = combineLatest([camera$, remScale$]).pipe(
            map(
                ([{ x, y, zoom }, rem]) => `scale(${rem}) translate(${x}px, ${y}px) scale(${zoom})`,
            ),
            distinctUntilChanged(),
            tap(transform => {
                board.style.transform = transform;
            }),
        );

        return merge(
            this.rendering.lifetime$,
            this.inspectionView.lifetime$,
            this.nodeView.lifetime$,
            this.wireView.lifetime$,
            merge(this.mapped$(layout$), viewed$, shownInspection$, pruning$, copying$).pipe(
                map(() => undefined),
            ),
        );
    }

    private mapped$(layout$: Observable<GraphLayout>): Observable<unknown> {
        const shadow = this.shadow;
        const board = requireChild(shadow, '.board');
        const wires = requireElement(shadow, '.wires', SVGSVGElement);
        const rubber = requireElement(shadow, '.rubber', SVGPathElement);

        const drawn$ = layout$.pipe(
            tap(({ bounds, stores, windows, wires: list }) => {
                // Sized to reach every node: the pointer maths reads the board's scale from its box.
                const width = Math.max(1, bounds.x + bounds.width);
                const height = Math.max(1, bounds.y + bounds.height);
                board.style.width = `${width}px`;
                board.style.height = `${height}px`;
                wires.setAttribute('width', String(width));
                wires.setAttribute('height', String(height));

                this.wireView.update(list);
                this.nodeView.update({ bounds, stores, windows, wires: list });
            }),
        );

        const dragged$ = this.drags$.pipe(
            withLatestFrom(layout$),
            tap(([{ phase, start, from, at, over }, layout]) => {
                const live = phase !== 'release' && start !== null;
                rubber.setAttribute('d', live ? wirePath(from, at) : '');
                board.toggleAttribute('data-dragging', live);

                for (const element of shadow.querySelectorAll(ENDS)) {
                    const end = endOf(element);
                    const command =
                        live && start !== null && end !== null ? commandOf(start, end) : null;
                    const ok = command !== null && !closesLoop(layout, command);
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
