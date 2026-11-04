import { combineLatest, EMPTY, merge, of, type Observable } from 'rxjs';
import { map, mergeMap, scan, share, shareReplay, startWith, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$, fromDocumentEvent$ } from '../../lib/rx.ts';
import { pointerGesture$, type Phase } from '../../shared/drag.ts';
import { wirePath } from '../../shared/connections.ts';
import { anchorOf, connectionOf, type WiringEvent, type WiringView } from './wiring.ts';
import css from './state-wiring.css?inline';

const sheet = styleSheet(css);
const SVG = 'http://www.w3.org/2000/svg';

type Drag = {
    readonly start: string | null;
    readonly over: string | null;
    readonly phase: Phase;
    readonly at: { readonly x: number; readonly y: number };
    readonly cancelled: boolean;
};

const released: Drag = {
    start: null,
    over: null,
    phase: 'release',
    at: { x: 0, y: 0 },
    cancelled: false,
};

const keyOf = (target: EventTarget | null) =>
    target instanceof Element
        ? (target.closest('[data-jack]')?.getAttribute('data-jack') ?? null)
        : null;

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
            '<svg class="wires" aria-hidden="true"></svg><svg class="rubber" aria-hidden="true"><path/></svg><div class="ports"></div><button class="exit" type="button" aria-label="close state mode" hidden>× Done</button>';
        this.shadow = shadow;
        const ports = requireChild(shadow, '.ports');
        this.drags$ = pointerGesture$(ports, event => keyOf(event.target) !== null).pipe(
            map(({ phase, event }) => {
                const rect = this.getBoundingClientRect();

                return {
                    phase,
                    key: keyOf(event.target),
                    over: keyOf(shadow.elementFromPoint(event.clientX, event.clientY)),
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
            fromElementEvent$(requireChild(shadow, '.exit'), 'click').pipe(map(() => null)),
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
                map((drag): WiringEvent => ({
                    kind: 'busy',
                    key: 'drag',
                    busy: drag.phase !== 'release',
                })),
            ),
            fromElementEvent$(requireChild(shadow, '.exit'), 'click').pipe(
                map((): WiringEvent => ({ kind: 'close' })),
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
        const exit = requireChild(shadow, '.exit');
        const drawn$ = view$.pipe(
            tap(view => {
                const origin = view?.origin ?? null;
                this.hidden = view === null;
                exit.hidden = origin === null;

                if (origin !== null) {
                    exit.style.left = `${origin.x}px`;
                    exit.style.top = `${origin.y}px`;
                }

                wires.replaceChildren(
                    ...(view?.wires ?? []).map(wire => {
                        const path = document.createElementNS(SVG, 'path');
                        path.setAttribute('d', wire.path);
                        path.style.setProperty('--store', wire.colour);
                        path.classList.toggle('shared', wire.shared);

                        return path;
                    }),
                );
                ports.replaceChildren(
                    ...(view?.sockets ?? []).map(socket => {
                        const row = document.createElement('div');
                        row.className = `socket ${socket.end.kind === 'store' ? 'output' : 'input'}`;
                        row.style.left = `${socket.x}px`;
                        row.style.top = `${socket.y}px`;
                        row.style.setProperty('--socket-width', `${socket.width}px`);
                        row.style.setProperty('--store', socket.colour);
                        const jack = document.createElement('button');
                        jack.type = 'button';
                        jack.className = 'jack';
                        jack.dataset['jack'] = socket.key;
                        jack.setAttribute('aria-label', `connect ${socket.title}`);
                        jack.title = `drag to connect ${socket.title}`;
                        const label = document.createElement('span');
                        label.textContent = socket.title;
                        const picker = document.createElement('button');
                        picker.type = 'button';
                        picker.className = 'selector';
                        picker.dataset['picker'] = socket.key;
                        picker.setAttribute('role', 'combobox');
                        picker.setAttribute('aria-haspopup', 'listbox');
                        picker.setAttribute('aria-expanded', 'false');
                        picker.setAttribute('aria-label', `${socket.title} state`);
                        picker.textContent =
                            socket.options.find(option => option.id === socket.current)?.name ??
                            'None';
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
                            const choice = document.createElement('button');
                            choice.type = 'button';
                            choice.className = 'choice';
                            choice.dataset['choice'] = socket.key;
                            choice.dataset['value'] = option.id;
                            choice.setAttribute('role', 'option');
                            choice.setAttribute(
                                'aria-selected',
                                String(option.id === socket.current),
                            );
                            choice.textContent = option.name;
                            choice.style.setProperty('--choice-colour', option.colour);
                            choices.append(choice);
                        });
                        row.dataset['socket'] = socket.key;
                        row.append(jack, label, picker, choices);
                        if (socket.end.kind === 'store') {
                            const manage = document.createElement('button');
                            manage.type = 'button';
                            manage.className = 'manage';
                            manage.dataset['manage'] = socket.window;
                            manage.textContent = '⋯';
                            manage.setAttribute('aria-label', 'manage output state');
                            row.append(manage);
                        }

                        return row;
                    }),
                );
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
            tap(({ path, live, valid, over }) => {
                rubber.setAttribute('d', path);
                this.toggleAttribute('data-dragging', live);
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
