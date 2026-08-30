import { EMPTY, of, type Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import css from './dock.css?inline';

const sheet = styleSheet(css);
const SVG = 'http://www.w3.org/2000/svg';

const TEMPLATE = `<div class="tray" role="toolbar" aria-label="programs"></div>`;

export type DockItem = {
    readonly id: string;
    readonly title: string;
    /** Path data on a 24x24 viewBox, stroked rather than filled. */
    readonly icon: string;
};

const programOf = (target: EventTarget | null): string | undefined => {
    const tile = target instanceof Element ? target.closest('.tile') : null;

    return tile instanceof HTMLElement ? tile.dataset['program'] : undefined;
};

export class HksDock extends HTMLElement {
    readonly activations$: Observable<string>;

    private readonly tray: HTMLElement;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.tray = requireChild(shadow, '.tray');

        this.activations$ = fromElementEvent$(this.tray, 'click').pipe(
            mergeMap(event => {
                const id = programOf(event.target);

                return id === undefined ? EMPTY : of(id);
            }),
        );
    }

    items(items: readonly DockItem[]): this {
        this.tray.replaceChildren(
            ...items.map(({ id, title, icon }) => {
                const tile = document.createElement('button');
                tile.type = 'button';
                tile.className = 'tile';
                tile.dataset['program'] = id;
                tile.title = `${title} — click to run`;
                tile.setAttribute('aria-label', title);

                // Built as nodes, not markup: an icon is path data, never HTML.
                const svg = document.createElementNS(SVG, 'svg');
                svg.setAttribute('viewBox', '0 0 24 24');
                svg.setAttribute('aria-hidden', 'true');

                const path = document.createElementNS(SVG, 'path');
                path.setAttribute('d', icon);
                svg.append(path);
                tile.append(svg);

                return tile;
            }),
        );

        return this;
    }

    connect$(running$: Observable<ReadonlySet<string>>): Observable<void> {
        return running$.pipe(
            tap(running => {
                for (const tile of this.tray.children) {
                    const id = programOf(tile);
                    const active = id !== undefined && running.has(id);

                    tile.classList.toggle('running', active);
                    tile.setAttribute('aria-pressed', String(active));
                }
            }),
            map(() => undefined),
        );
    }
}

customElements.define('hks-dock', HksDock);
