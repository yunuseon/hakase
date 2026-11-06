import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html, svg } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { when } from 'lit-html/directives/when.js';
import { classMap } from 'lit-html/directives/class-map.js';
import { withValue } from '../../lib/lit.ts';

import { renderView, type RenderView } from '../../lib/lit.ts';
import { combineLatest, EMPTY, merge, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    map,
    mergeMap,
    scan,
    share,
    shareReplay,
    startWith,
    tap,
} from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$, fromDocumentEvent$ } from '../../lib/rx.ts';
import { pointerGesture$, type Phase } from '../../shared/drag.ts';
import { wirePath } from '../../shared/connections.ts';
import {
    anchorOf,
    connectionOf,
    type GroupRow,
    type Socket,
    type WiringEvent,
    type WiringView,
} from './wiring.ts';
import css from './state-wiring.css?inline';

const sheet = styleSheet(css);

type Drag = {
    readonly start: string | null;
    readonly over: string | null;
    readonly group: string | null;
    readonly phase: Phase;
    readonly at: { readonly x: number; readonly y: number };
    readonly cancelled: boolean;
};

const released: Drag = {
    start: null,
    over: null,
    group: null,
    phase: 'release',
    at: { x: 0, y: 0 },
    cancelled: false,
};

const closestData = (target: EventTarget | null, name: string) =>
    target instanceof Element
        ? (target.closest(`[data-${name}]`)?.getAttribute(`data-${name}`) ?? null)
        : null;

const keyOf = (target: EventTarget | null) => closestData(target, 'jack');

const focusedIn = (shadow: ShadowRoot) => {
    const active = shadow.activeElement;

    return ['group', 'picker', 'jack', 'manage', 'choice'].flatMap(name => {
        const value = active?.getAttribute(`data-${name}`);
        const option = active?.getAttribute('data-value');

        return value === null || value === undefined
            ? []
            : [
                  name === 'choice'
                      ? `[data-choice="${CSS.escape(value)}"][data-value="${CSS.escape(option ?? '')}"]`
                      : `[data-${name}="${CSS.escape(value)}"]`,
              ];
    })[0];
};

type WiringRender = {
    readonly view: WiringView | null;
    readonly rows: readonly (Socket | GroupRow)[];
};
const socketOf = (row: Socket | GroupRow | undefined): Socket | undefined =>
    row !== undefined && 'end' in row ? row : undefined;
const groupOf = (row: Socket | GroupRow | undefined): GroupRow | undefined =>
    row !== undefined && !('end' in row) ? row : undefined;

const SocketRow = (props: { readonly socket: Socket }) =>
    html`<div
        class=${ifDefined(`socket ${props.socket.end.kind === 'store' ? 'output' : 'input'}`)}
        data-socket=${ifDefined(props.socket.key)}
        data-member=${ifDefined(props.socket.group !== null ? '' : undefined)}
        style=${styleMap({
            left: `${props.socket.x}px`,
            top: `${props.socket.y}px`,
            '--socket-width': `${props.socket.width}px`,
            '--store': props.socket.colour,
        })}
    >
        <button
            type="button"
            class="jack"
            data-jack=${ifDefined(props.socket.key)}
            aria-label=${ifDefined(`connect ${props.socket.title}`)}
            title=${ifDefined(`drag to connect ${props.socket.title}`)}
        ></button
        ><span>${props.socket.title}</span
        ><button
            type="button"
            class="selector"
            data-picker=${ifDefined(props.socket.key)}
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded="false"
            aria-label=${ifDefined(`${props.socket.title} state`)}
        >
            ${
                props.socket.options.find(option => option.id === props.socket.current)?.name ??
                'None'
            }
        </button>
        <div
            class="choices"
            role="listbox"
            aria-label=${ifDefined(`${props.socket.title} states`)}
            style=${styleMap({ 'max-height': `${props.socket.menu.height}px` })}
            data-above=${ifDefined(props.socket.menu.above ? '' : undefined)}
        >
            ${repeat(
                props.socket.optional
                    ? [{ id: '', name: 'None', colour: 'var(--muted)' }, ...props.socket.options]
                    : props.socket.options,
                item => item,
                option =>
                    html`<button
                        type="button"
                        class="choice"
                        data-choice=${ifDefined(props.socket.key)}
                        data-value=${ifDefined(option.id)}
                        role="option"
                        aria-selected=${ifDefined(option.id === props.socket.current)}
                        style=${styleMap({ '--choice-colour': option.colour })}
                    >
                        ${option.name}
                    </button>`,
            )}
        </div>
        ${when(props.socket.end.kind === 'store', () => html`<button type="button" class="manage" data-manage=${ifDefined(props.socket.window)} aria-label="manage output state">⋯</button>`)}
    </div>`;
const GroupPill = (props: { readonly group: GroupRow }) =>
    html`<button
        type="button"
        class="group"
        data-group=${ifDefined(props.group.key)}
        data-bound=${ifDefined(props.group.bound > 0 ? '' : undefined)}
        style=${styleMap({
            left: `${props.group.x}px`,
            top: `${props.group.y}px`,
            '--socket-width': `${props.group.width}px`,
            '--store': props.group.colour,
        })}
        aria-expanded=${ifDefined(props.group.open)}
        title=${ifDefined(`${props.group.title}: ${props.group.bound === 0 ? 'none' : `${props.group.bound} of ${props.group.total}`} connected. Click to ${props.group.open ? 'hide' : 'show'} its inputs.`)}
    >
        <span class="hub"></span
        ><span class="pill"
            ><span class="name">${props.group.title}</span
            ><span class="count">${props.group.bound === 0 ? '' : props.group.bound}</span
            ><span class="chevron" aria-hidden="true"></span
        ></span>
    </button>`;

export class HksStateWiring extends HTMLElement {
    readonly changes$: Observable<WiringEvent>;
    private readonly shadow: ShadowRoot;
    private readonly drags$: Observable<Drag>;
    private readonly opened$: Observable<string | null>;
    private readonly choices$: Observable<{ readonly key: string; readonly value: string }>;

    private readonly rendering: RenderView<WiringRender>;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<WiringRender>(
            shadow,
            { view: null, rows: [] },
            state =>
                html`<svg class="wires" aria-hidden="true">
                        ${repeat(
                            state.view?.wires ?? [],
                            item => item,
                            wire =>
                                svg`<path d=${ifDefined(wire.path)} style=${styleMap({ '--store': wire.colour })} class=${classMap({ shared: wire.shared })}></path>`,
                        )}</svg
                    ><svg class="rubber" aria-hidden="true"><path></path></svg>
                    <div class="ports">
                        ${repeat(
                            state.rows.map(row => row.key),
                            item => item,
                            key =>
                                html`${withValue(socketOf(state.rows.find(row => row.key === key)), socket => SocketRow({ socket: socket }))}${withValue(
                                    groupOf(state.rows.find(row => row.key === key)),
                                    group =>
                                        html`${when(
                                            group.open,
                                            () =>
                                                html`<div
                                                    class="rail"
                                                    style=${styleMap({
                                                        left: `${group.x + 10}px`,
                                                        top: `${group.y + 14}px`,
                                                        height: `${
                                                            (state.view?.sockets
                                                                .filter(socket =>
                                                                    group.members.includes(
                                                                        socket.key,
                                                                    ),
                                                                )
                                                                .at(-1)?.y ?? group.y) - group.y
                                                        }px`,
                                                    })}
                                                ></div>`,
                                        )}${GroupPill({ group: group })}`,
                                )}`,
                        )}
                    </div>`,
        );
        this.shadow = shadow;
        const ports = requireChild(shadow, '.ports');
        this.drags$ = pointerGesture$(ports, event => keyOf(event.target) !== null).pipe(
            map(({ phase, event }) => {
                const rect = this.getBoundingClientRect();

                return {
                    phase,
                    key: keyOf(event.target),
                    over: keyOf(shadow.elementFromPoint(event.clientX, event.clientY)),
                    group: closestData(
                        shadow.elementFromPoint(event.clientX, event.clientY),
                        'group',
                    ),
                    at: {
                        x: (event.clientX - rect.x) / rect.width,
                        y: (event.clientY - rect.y) / rect.height,
                    },
                    cancelled: event.type === 'pointercancel',
                };
            }),
            scan(
                (drag: Drag, next): Drag => ({
                    start: next.phase === 'grab' ? next.key : drag.start,
                    over: next.over,
                    group: next.group,
                    phase: next.phase,
                    at: next.at,
                    cancelled: next.cancelled,
                }),
                released,
            ),
            share(),
        );
        this.choices$ = fromElementEvent$(ports, 'click').pipe(
            mergeMap(({ target }) => {
                const option = target instanceof Element ? target.closest('[data-choice]') : null;

                return option instanceof HTMLElement &&
                    option.dataset['choice'] !== undefined &&
                    option.dataset['value'] !== undefined
                    ? of({ key: option.dataset['choice'], value: option.dataset['value'] })
                    : EMPTY;
            }),
        );
        this.opened$ = merge(
            fromElementEvent$(ports, 'click').pipe(
                mergeMap(({ target }) => {
                    const picker =
                        target instanceof Element
                            ? (target.closest('[data-picker]')?.getAttribute('data-picker') ?? null)
                            : null;

                    return picker === null ? EMPTY : of(picker);
                }),
            ),
            this.choices$.pipe(map(() => null)),
            fromDocumentEvent$('pointerdown').pipe(
                mergeMap(event => (event.composedPath().includes(this) ? EMPTY : of(null))),
            ),
            fromDocumentEvent$('keydown').pipe(
                mergeMap(event => (event.key === 'Escape' ? of(null) : EMPTY)),
            ),
            fromElementEvent$(ports, 'focusout').pipe(
                mergeMap(event =>
                    event.relatedTarget instanceof Node && shadow.contains(event.relatedTarget)
                        ? EMPTY
                        : of(null),
                ),
            ),
        ).pipe(
            scan((open: string | null, key): string | null => (key === open ? null : key), null),
            startWith(null),
            shareReplay({ bufferSize: 1, refCount: true }),
        );
        // Apply choices and drops before releasing their locks, or a released W discards the command.
        this.changes$ = merge(
            this.choices$.pipe(map((choice): WiringEvent => ({ kind: 'select', ...choice }))),
            this.opened$.pipe(
                map((open): WiringEvent => ({
                    kind: 'busy',
                    key: 'selector',
                    busy: open !== null,
                })),
            ),
            this.drags$.pipe(
                mergeMap((drag): WiringEvent[] =>
                    drag.phase === 'release' &&
                    !drag.cancelled &&
                    drag.start !== null &&
                    drag.over !== null
                        ? [{ kind: 'drag', from: drag.start, to: drag.over }]
                        : [],
                ),
            ),
            this.drags$.pipe(
                map(({ phase, start, group }) =>
                    phase === 'move' && start !== null && group !== null
                        ? { from: start, group }
                        : null,
                ),
                distinctUntilChanged((a, b) => a?.from === b?.from && a?.group === b?.group),
                mergeMap((hover): WiringEvent[] =>
                    hover === null ? [] : [{ kind: 'hover', ...hover }],
                ),
            ),
            this.drags$.pipe(
                mergeMap((drag): WiringEvent[] =>
                    drag.phase === 'release' && drag.start !== null
                        ? [{ kind: 'land', to: drag.cancelled ? null : drag.over }]
                        : [],
                ),
            ),
            fromElementEvent$(ports, 'click').pipe(
                mergeMap(({ target }): WiringEvent[] => {
                    const group = closestData(target, 'group');

                    return group === null ? [] : [{ kind: 'toggle', group }];
                }),
            ),
            this.drags$.pipe(
                map((drag): WiringEvent => ({
                    kind: 'busy',
                    key: 'drag',
                    busy: drag.phase !== 'release',
                })),
            ),
            fromElementEvent$(ports, 'click').pipe(
                mergeMap(({ target }): WiringEvent[] => {
                    const window =
                        target instanceof Element
                            ? (target.closest('[data-manage]')?.getAttribute('data-manage') ?? null)
                            : null;

                    return window === null ? [] : [{ kind: 'manage', window }];
                }),
            ),
        );
    }

    connect$(view$: Observable<WiringView | null>): Observable<void> {
        const shadow = this.shadow;
        const ports = requireChild(shadow, '.ports');
        const rubber = requireElement(shadow, '.rubber path', SVGPathElement);
        const drawn$ = view$.pipe(
            tap(view => {
                this.hidden = view === null;

                const focused = focusedIn(shadow);
                const sockets = view?.sockets ?? [];
                const windows = [...new Set(sockets.map(socket => socket.window))];
                const rows = [
                    ...(view?.groups ?? []),
                    ...sockets.filter(socket => !socket.hidden),
                ].sort(
                    (a, b) => windows.indexOf(a.window) - windows.indexOf(b.window) || a.y - b.y,
                );
                this.rendering.update({ view, rows });

                const replacement = focused === undefined ? null : ports.querySelector(focused);

                if (replacement instanceof HTMLElement) {
                    replacement.focus();
                }
            }),
            shareReplay({ bufferSize: 1, refCount: true }),
        );
        const opened$ = combineLatest([drawn$, this.opened$]).pipe(
            tap(([, open]) => {
                for (const row of ports.querySelectorAll('[data-socket]')) {
                    const active = row.getAttribute('data-socket') === open;
                    row.toggleAttribute('data-open', active);
                    row.querySelector('[data-picker]')?.setAttribute(
                        'aria-expanded',
                        String(active),
                    );
                }
            }),
        );
        const dragged$ = combineLatest([drawn$, this.drags$.pipe(startWith(released))]).pipe(
            map(([view, drag]) => {
                const from = view?.sockets.find(socket => socket.key === drag.start);
                const live = drag.phase !== 'release' && from !== undefined;

                return {
                    path: live ? wirePath(anchorOf(from), drag.at) : '',
                    groups: view?.groups ?? [],
                    live,
                    over: drag.over,
                    valid: new Set(
                        (from !== undefined && live
                            ? (view?.sockets ?? []).filter(to => connectionOf(from, to) !== null)
                            : []
                        ).map(socket => socket.key),
                    ),
                };
            }),
            tap(({ path, live, valid, over, groups }) => {
                rubber.setAttribute('d', path);
                this.toggleAttribute('data-dragging', live);

                for (const row of ports.querySelectorAll('[data-group]')) {
                    const members = groups.find(
                        group => group.key === row.getAttribute('data-group'),
                    )?.members;
                    row.toggleAttribute(
                        'data-compatible',
                        members?.some(key => valid.has(key)) === true,
                    );
                }

                for (const jack of ports.querySelectorAll('[data-jack]')) {
                    const key = jack.getAttribute('data-jack') ?? '';
                    jack.toggleAttribute('data-compatible', valid.has(key));
                    jack.parentElement?.toggleAttribute('data-compatible', valid.has(key));
                    jack.toggleAttribute('data-over', valid.has(key) && key === over);
                }
            }),
        );

        return merge(this.rendering.lifetime$, drawn$, dragged$, opened$).pipe(
            map(() => undefined),
        );
    }
}

customElements.define('hks-state-wiring', HksStateWiring);
