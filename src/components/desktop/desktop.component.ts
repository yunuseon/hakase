import { defer, EMPTY, merge, of, type Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { pointerDelta$ } from '../../shared/drag.ts';
import css from './desktop.css?inline';

const sheet = styleSheet(css);
const SVG = 'http://www.w3.org/2000/svg';

const TEMPLATE = `<div class="board"></div>`;

export type Shortcut = {
    readonly id: string;
    readonly title: string;
    /** Path data on a 24x24 viewBox, stroked rather than filled. */
    readonly icon: string;
};

export type ShortcutDrag = {
    readonly id: string;
    readonly dx: number;
    readonly dy: number;
};

const programOf = (target: EventTarget | null): string | undefined => {
    const shortcut = target instanceof Element ? target.closest('.shortcut') : null;

    return shortcut instanceof HTMLElement ? shortcut.dataset['program'] : undefined;
};

export class HksDesktop extends HTMLElement {
    readonly launches$: Observable<string>;
    readonly drags$: Observable<ShortcutDrag>;

    private readonly board: HTMLElement;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.board = requireChild(shadow, '.board');

        this.launches$ = fromElementEvent$(this.board, 'dblclick').pipe(
            mergeMap(event => {
                const id = programOf(event.target);

                return id === undefined ? EMPTY : of(id);
            }),
        );

        // Deferred: the shortcuts to drag only exist once items() has built them.
        this.drags$ = defer(() =>
            merge(
                ...[...this.board.children].map(shortcut =>
                    shortcut instanceof HTMLElement
                        ? pointerDelta$(shortcut).pipe(
                              map(({ dx, dy }): ShortcutDrag => ({
                                  id: shortcut.dataset['program'] ?? '',
                                  dx,
                                  dy,
                              })),
                          )
                        : EMPTY,
                ),
            ),
        );
    }

    items(shortcuts: readonly Shortcut[]): this {
        this.board.replaceChildren(
            ...shortcuts.map(({ id, title, icon }) => {
                const tile = document.createElement('div');
                tile.className = 'shortcut';
                tile.dataset['program'] = id;
                tile.tabIndex = 0;
                tile.title = `${title} — double click to run`;

                // Built as nodes, not markup: an icon is path data, never HTML.
                const svg = document.createElementNS(SVG, 'svg');
                svg.setAttribute('viewBox', '0 0 24 24');
                svg.setAttribute('aria-hidden', 'true');

                const path = document.createElementNS(SVG, 'path');
                path.setAttribute('d', icon);
                svg.append(path);

                const name = document.createElement('span');
                name.className = 'name';
                name.textContent = title;

                tile.append(svg, name);

                return tile;
            }),
        );

        return this;
    }

    connect$(spots$: Observable<Readonly<Record<string, { x: number; y: number }>>>) {
        return spots$.pipe(
            tap(spots => {
                for (const shortcut of this.board.children) {
                    const id = programOf(shortcut);
                    const spot = id === undefined ? undefined : spots[id];

                    if (spot !== undefined && shortcut instanceof HTMLElement) {
                        shortcut.style.transform = `translate(${spot.x.toFixed(0)}px, ${spot.y.toFixed(0)}px)`;
                    }
                }
            }),
            map(() => undefined),
        );
    }
}

customElements.define('hks-desktop', HksDesktop);
