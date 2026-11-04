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
const SVG = 'http://www.w3.org/2000/svg';

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

const button = (className: string) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;

    return element;
};

const inputRow = (socket: Socket) => {
    const row = document.createElement('div');
    row.className = `socket ${socket.end.kind === 'store' ? 'output' : 'input'}`;
    row.toggleAttribute('data-member', socket.group !== null);
    row.style.left = `${socket.x}px`;
    row.style.top = `${socket.y}px`;
    row.style.setProperty('--socket-width', `${socket.width}px`);
    row.style.setProperty('--store', socket.colour);
    const jack = button('jack');
    jack.dataset['jack'] = socket.key;
    jack.setAttribute('aria-label', `connect ${socket.title}`);
    jack.title = `drag to connect ${socket.title}`;
    const label = document.createElement('span');
    label.textContent = socket.title;
    const picker = button('selector');
    picker.dataset['picker'] = socket.key;
    picker.setAttribute('role', 'combobox');
    picker.setAttribute('aria-haspopup', 'listbox');
    picker.setAttribute('aria-expanded', 'false');
    picker.setAttribute('aria-label', `${socket.title} state`);
    picker.textContent =
        socket.options.find(option => option.id === socket.current)?.name ?? 'None';
    const choices = document.createElement('div');
    choices.className = 'choices';
    choices.setAttribute('role', 'listbox');
    choices.setAttribute('aria-label', `${socket.title} states`);
    choices.style.maxHeight = `${socket.menu.height}px`;
    choices.toggleAttribute('data-above', socket.menu.above);
    const options = socket.optional
        ? [{ id: '', name: 'None', colour: 'var(--muted)' }, ...socket.options]
        : socket.options;
    options.forEach(option => {
        const choice = button('choice');
        choice.dataset['choice'] = socket.key;
        choice.dataset['value'] = option.id;
        choice.setAttribute('role', 'option');
        choice.setAttribute('aria-selected', String(option.id === socket.current));
        choice.textContent = option.name;
        choice.style.setProperty('--choice-colour', option.colour);
        choices.append(choice);
    });
    row.dataset['socket'] = socket.key;
    row.append(jack, label, picker, choices);

    if (socket.end.kind === 'store') {
        const manage = button('manage');
        manage.dataset['manage'] = socket.window;
        manage.textContent = '⋯';
        manage.setAttribute('aria-label', 'manage output state');
        row.append(manage);
    }

    return row;
};

const groupRow = (group: GroupRow) => {
    const row = button('group');
    row.dataset['group'] = group.key;
    row.style.left = `${group.x}px`;
    row.style.top = `${group.y}px`;
    row.style.setProperty('--socket-width', `${group.width}px`);
    row.style.setProperty('--store', group.colour);
    row.setAttribute('aria-expanded', String(group.open));
    row.toggleAttribute('data-bound', group.bound > 0);
    const bound = group.bound === 0 ? 'none' : `${group.bound} of ${group.total}`;
    row.title = `${group.title}: ${bound} connected. Click to ${group.open ? 'hide' : 'show'} its inputs.`;
    const hub = document.createElement('span');
    hub.className = 'hub';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = group.title;
    const count = document.createElement('span');
    count.className = 'count';
    count.textContent = group.bound === 0 ? '' : String(group.bound);
    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.setAttribute('aria-hidden', 'true');
    const pill = document.createElement('span');
    pill.className = 'pill';
    pill.append(name, count, chevron);
    row.append(hub, pill);

    return row;
};

const railOf = (group: GroupRow, sockets: readonly Socket[]) => {
    const last = sockets.filter(socket => group.members.includes(socket.key)).at(-1);
    const rail = document.createElement('div');
    rail.className = 'rail';
    rail.style.left = `${group.x + 10}px`;
    rail.style.top = `${group.y + 14}px`;
    rail.style.height = `${(last?.y ?? group.y) - group.y}px`;

    return rail;
};

export class HksStateWiring extends HTMLElement {
    readonly changes$: Observable<WiringEvent>;
    private readonly shadow: ShadowRoot;
    private readonly drags$: Observable<Drag>;
    private readonly opened$: Observable<string | null>;
    private readonly choices$: Observable<{ readonly key: string; readonly value: string }>;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML =
            '<svg class="wires" aria-hidden="true"></svg><svg class="rubber" aria-hidden="true"><path/></svg><div class="ports"></div>';
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
        const wires = requireElement(shadow, '.wires', SVGSVGElement);
        const rubber = requireElement(shadow, '.rubber path', SVGPathElement);
        const drawn$ = view$.pipe(
            tap(view => {
                this.hidden = view === null;

                wires.replaceChildren(
                    ...(view?.wires ?? []).map(wire => {
                        const path = document.createElementNS(SVG, 'path');
                        path.setAttribute('d', wire.path);
                        path.style.setProperty('--store', wire.colour);
                        path.classList.toggle('shared', wire.shared);

                        return path;
                    }),
                );
                const focused = focusedIn(shadow);
                const sockets = view?.sockets ?? [];

                const windows = [...new Set(sockets.map(socket => socket.window))];
                // In reading order, window by window and top to bottom, so Tab walks the rows as they are seen.
                const rows = [
                    ...(view?.groups ?? []).map(group => ({
                        ...group,
                        nodes: group.open
                            ? [railOf(group, sockets), groupRow(group)]
                            : [groupRow(group)],
                    })),
                    ...sockets
                        .filter(socket => !socket.hidden)
                        .map(socket => ({ ...socket, nodes: [inputRow(socket)] })),
                ].sort(
                    (a, b) => windows.indexOf(a.window) - windows.indexOf(b.window) || a.y - b.y,
                );

                ports.replaceChildren(...rows.flatMap(row => row.nodes));

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

        return merge(drawn$, dragged$, opened$).pipe(map(() => undefined));
    }
}

customElements.define('hks-state-wiring', HksStateWiring);
