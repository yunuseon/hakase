import { merge, type Observable } from 'rxjs';
import { filter, map, mergeMap, scan, share, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { pointerGesture$, type Phase } from '../../shared/drag.ts';
import {
    wirePath,
    type PatchCommand,
    type PatchLayout,
    type PlacedPort,
    type PlacedStore,
    type PlacedWindow,
    type Point,
} from './patch.ts';
import css from './patch-bay.css?inline';

const sheet = styleSheet(css);
const SVG = 'http://www.w3.org/2000/svg';

const TEMPLATE = `
    <div class="board">
        <svg class="wires" aria-hidden="true"><path class="rubber" /></svg>
        <div class="nodes"></div>
    </div>
    <p class="empty">No window keeps or follows any state yet.</p>
`;

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

const commandOf = (a: End, b: End | null): PatchCommand | null => {
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

const storeNode = ({ id, program, kind, title, name, colour, x, y, height }: PlacedStore) => {
    const node = placed(document.createElement('div'), x, y, height);
    node.className = 'node store';
    node.dataset['store'] = id;
    node.dataset['program'] = program;

    if (kind !== null) {
        node.dataset['feeds'] = kind;
    }

    node.style.setProperty('--store', colour);
    node.title = `${title} · ${name}: drag onto a window to bind or follow it`;

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
    head.title = 'double-click to show this window';
    head.append(iconOf(icon), span('label', label));

    if (own !== null) {
        head.dataset['own'] = id;
        head.dataset['program'] = program;
        head.dataset['current'] = own.store;
        head.prepend(span('jack'));

        if (own.shown === 'tag') {
            const tag = span('tag');
            tag.dataset['store'] = own.store;
            tag.dataset['program'] = program;
            tag.style.setProperty('--store', own.colour);
            tag.title = `${own.name}: only this window uses it; drag onto another window to share it`;
            tag.append(span('dot'), span('name', own.name));
            head.append(tag);
        }
    }

    node.append(head, ...ports.map(port => portRow(id, port)));

    return node;
};

export class HksPatchBay extends HTMLElement {
    readonly commands$: Observable<PatchCommand>;

    private readonly shadow: ShadowRoot;
    private readonly drags$: Observable<Drag>;

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
        this.drags$ = pointerGesture$(board, start => endOf(start.target) !== null).pipe(
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

        this.commands$ = merge(
            this.drags$.pipe(
                filter(({ phase }) => phase === 'release'),
                mergeMap(({ start, over }) => {
                    const command = start === null ? null : commandOf(start, over);

                    return command === null ? [] : [command];
                }),
            ),
            fromElementEvent$(board, 'click').pipe(
                mergeMap(({ target }): PatchCommand[] => {
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
            fromElementEvent$(board, 'dblclick').pipe(
                mergeMap(({ target }): PatchCommand[] => {
                    const head = target instanceof Element ? target.closest('.head') : null;
                    const node = head?.closest('[data-window-node]');

                    return node instanceof HTMLElement && node.dataset['windowNode'] !== undefined
                        ? [{ kind: 'reveal', window: node.dataset['windowNode'] }]
                        : [];
                }),
            ),
        );
    }

    connect$(layout$: Observable<PatchLayout>): Observable<void> {
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
                this.toggleAttribute('data-empty', windows.length === 0);

                const paths = list.map(({ kind, path, colour, removable }) => {
                    const wire = document.createElementNS(SVG, 'path');
                    wire.classList.add('wire', kind);
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

        return merge(drawn$, dragged$).pipe(map(() => undefined));
    }
}

customElements.define('hks-patch-bay', HksPatchBay);
