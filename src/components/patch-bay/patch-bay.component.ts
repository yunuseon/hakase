import { merge, type Observable } from 'rxjs';
import { filter, map, mergeMap, scan, share, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { pointerGesture$, type Phase } from '../../shared/drag.ts';
import { wirePath, type PatchCommand, type PatchLayout, type Point } from './patch.ts';
import css from './patch-bay.css?inline';

const sheet = styleSheet(css);
const SVG = 'http://www.w3.org/2000/svg';

const TEMPLATE = `
    <div class="board">
        <svg class="wires" aria-hidden="true"><path class="rubber" /></svg>
        <div class="nodes"></div>
    </div>
    <p class="empty">No window follows anything yet. Open a sketch, a dial or a signal.</p>
`;

type End =
    | {
          readonly kind: 'source';
          readonly id: string;
          readonly source: string;
          readonly store: string;
      }
    | {
          readonly kind: 'port';
          readonly sink: string;
          readonly input: string;
          readonly accepts: readonly string[];
          readonly cuttable: boolean;
      };

type Drag = {
    readonly phase: Phase;
    readonly start: End | null;
    readonly from: Point;
    readonly at: Point;
    readonly over: End | null;
};

const endOf = (target: EventTarget | null): End | null => {
    const element =
        target instanceof Element ? target.closest('[data-source], [data-input]') : null;

    if (!(element instanceof HTMLElement) || target instanceof HTMLButtonElement) {
        return null;
    }

    const { source, kind, store, sink, input, accepts, cuttable } = element.dataset;

    if (source !== undefined && kind !== undefined && store !== undefined) {
        return { kind: 'source', id: source, source: kind, store };
    }

    return sink !== undefined && input !== undefined && accepts !== undefined
        ? {
              kind: 'port',
              sink,
              input,
              accepts: accepts.split(' '),
              cuttable: cuttable !== undefined,
          }
        : null;
};

const fits = (a: End, b: End | null): boolean =>
    b !== null &&
    ((a.kind === 'source' && b.kind === 'port' && b.accepts.includes(a.source)) ||
        (a.kind === 'port' && b.kind === 'source' && a.accepts.includes(b.source)));

const commandOf = (start: End, over: End | null): PatchCommand | null => {
    if (over === null) {
        return start.kind === 'port' && start.cuttable
            ? { kind: 'disconnect', sink: start.sink, input: start.input }
            : null;
    }

    if (!fits(start, over)) {
        return null;
    }

    const source = start.kind === 'source' ? start : over.kind === 'source' ? over : null;
    const port = start.kind === 'port' ? start : over.kind === 'port' ? over : null;

    return source === null || port === null
        ? null
        : {
              kind: 'connect',
              sink: port.sink,
              input: port.input,
              source: source.source,
              store: source.store,
          };
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

const placed = (element: HTMLElement, x: number, y: number, height: number): HTMLElement => {
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    element.style.height = `${height}px`;

    return element;
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
        const jackOf = (end: End): Point | null => {
            const selector =
                end.kind === 'source'
                    ? `[data-source="${end.id}"] .jack`
                    : `[data-sink="${end.sink}"][data-input="${end.input}"] .jack`;
            const jack = shadow.querySelector(selector);

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

                    if (phase === 'grab') {
                        const start = endOf(event.target);

                        return {
                            phase,
                            start,
                            from: (start === null ? null : jackOf(start)) ?? at,
                            at,
                            over: null,
                        };
                    }

                    return { ...drag, phase, at, over };
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
                        port.dataset['sink'] !== undefined &&
                        port.dataset['input'] !== undefined
                        ? [
                              {
                                  kind: 'disconnect',
                                  sink: port.dataset['sink'],
                                  input: port.dataset['input'],
                              },
                          ]
                        : [];
                }),
            ),
            fromElementEvent$(board, 'dblclick').pipe(
                mergeMap(({ target }): PatchCommand[] => {
                    const head = target instanceof Element ? target.closest('.head') : null;
                    const sink = head?.closest('[data-sink-node]');

                    return sink instanceof HTMLElement && sink.dataset['sinkNode'] !== undefined
                        ? [{ kind: 'reveal', sink: sink.dataset['sinkNode'] }]
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
            tap(({ width, height, sources, sinks, wires: list }) => {
                board.style.width = `${width}px`;
                board.style.height = `${height}px`;
                wires.setAttribute('width', String(width));
                wires.setAttribute('height', String(height));
                this.toggleAttribute('data-empty', sinks.length === 0);

                const paths = list.map(({ path, colour, removable }) => {
                    const wire = document.createElementNS(SVG, 'path');
                    wire.classList.add('wire');
                    wire.toggleAttribute('data-fixed', !removable);
                    wire.setAttribute('d', path);
                    wire.style.setProperty('--store', colour);

                    return wire;
                });
                wires.replaceChildren(...paths, rubber);

                const sourceNodes = sources.map(
                    ({ id, kind, store, title, name, colour, x, y, height: h }) => {
                        const node = placed(document.createElement('div'), x, y, h);
                        node.className = 'node source';
                        node.dataset['source'] = id;
                        node.dataset['kind'] = kind;
                        node.dataset['store'] = store;
                        node.style.setProperty('--store', colour);
                        node.title = `drag onto an input to follow ${title.toLowerCase()} · ${name}`;

                        const dot = document.createElement('span');
                        dot.className = 'dot';
                        const label = document.createElement('span');
                        label.className = 'label';
                        const kindLabel = document.createElement('span');
                        kindLabel.className = 'kind';
                        kindLabel.textContent = title;
                        const nameLabel = document.createElement('span');
                        nameLabel.className = 'name';
                        nameLabel.textContent = name;
                        label.append(kindLabel, nameLabel);
                        const jack = document.createElement('span');
                        jack.className = 'jack';
                        node.append(dot, label, jack);

                        return node;
                    },
                );

                const sinkNodes = sinks.map(({ id, label, icon, ports, x, y, height: h }) => {
                    const node = placed(document.createElement('div'), x, y, h);
                    node.className = 'node sink';
                    node.dataset['sinkNode'] = id;

                    const head = document.createElement('div');
                    head.className = 'head';
                    head.title = 'double-click to show this window';
                    const name = document.createElement('span');
                    name.textContent = label;
                    head.append(iconOf(icon), name);

                    const rows = ports.map(({ input, title, accepts, optional, bound }) => {
                        const row = document.createElement('div');
                        row.className = 'port';
                        row.dataset['sink'] = id;
                        row.dataset['input'] = input;
                        row.dataset['accepts'] = accepts.join(' ');
                        row.toggleAttribute('data-bound', bound !== null);
                        row.toggleAttribute('data-cuttable', optional && bound !== null);

                        const jack = document.createElement('span');
                        jack.className = 'jack';
                        const text = document.createElement('span');
                        text.className = 'title';
                        text.textContent = title;
                        row.append(jack, text);

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
                    });

                    node.append(head, ...rows);

                    return node;
                });

                nodes.replaceChildren(...sourceNodes, ...sinkNodes);
            }),
        );

        const dragged$ = this.drags$.pipe(
            tap(({ phase, start, from, at, over }) => {
                const live = phase !== 'release' && start !== null;
                rubber.setAttribute('d', live ? wirePath(from, at) : '');
                board.toggleAttribute('data-dragging', live);

                for (const node of shadow.querySelectorAll('[data-source], [data-input]')) {
                    const end = endOf(node);
                    node.toggleAttribute('data-ok', live && start !== null && fits(start, end));
                    node.toggleAttribute(
                        'data-over',
                        live && end !== null && over !== null && sameEnd(end, over),
                    );
                }
            }),
        );

        return merge(drawn$, dragged$).pipe(map(() => undefined));
    }
}

const sameEnd = (a: End, b: End): boolean =>
    a.kind === 'source'
        ? b.kind === 'source' && a.id === b.id
        : b.kind === 'port' && a.sink === b.sink && a.input === b.input;

customElements.define('hks-patch-bay', HksPatchBay);
