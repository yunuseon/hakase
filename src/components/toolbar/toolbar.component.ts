import { EMPTY, of, type Observable, merge } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { isPlacement, sameToolbarView, type Placement, type ToolbarView } from './toolbar.ts';
import css from './toolbar.css?inline';

const sheet = styleSheet(css);
const SVG = 'http://www.w3.org/2000/svg';

const glyph = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

const place = (value: Placement, label: string, d: string) => `
    <button class="choice" type="button" role="menuitemradio" data-place="${value}">
        ${glyph(d)}<span>${label}</span>
    </button>
`;

const TEMPLATE = `
    <div class="tray" role="toolbar" aria-label="programs">
        <div class="group programs"></div>
        <details class="group menu">
            <summary class="key" aria-label="toolbar position" title="toolbar position">${glyph('M5 5 H19 V19 H5 Z M10 5 V19')}</summary>
            <div class="places" role="menu" aria-label="toolbar position">
                ${place('top', 'Top', 'M5 5 H19 M5 9 H19 V19 H5 Z')}
                ${place('bottom', 'Bottom', 'M5 19 H19 M5 5 H19 V15 H5 Z')}
                ${place('left', 'Left', 'M5 5 V19 M9 5 H19 V19 H9 Z')}
                ${place('right', 'Right', 'M19 5 V19 M5 5 H15 V19 H5 Z')}
                ${place('float', 'Own window', 'M4 8 H16 V20 H4 Z M8 4 H20 V16')}
            </div>
        </details>
    </div>
    <button class="tab" type="button" aria-label="hide toolbar" title="hide toolbar">${glyph('M14 7 L9 12 L14 17')}</button>
`;

export type ToolbarItem = {
    readonly id: string;
    readonly title: string;
    // Path data on a 24x24 viewBox, stroked rather than filled.
    readonly icon: string;
};

const dataOf = (target: EventTarget | null, key: string): string | undefined => {
    const element = target instanceof Element ? target.closest(`[data-${key}]`) : null;

    return element instanceof HTMLElement ? element.dataset[key] : undefined;
};

const clicked$ = (element: HTMLElement, key: string): Observable<string> =>
    fromElementEvent$(element, 'click').pipe(
        mergeMap(event => {
            const value = dataOf(event.target, key);

            return value === undefined ? EMPTY : of(value);
        }),
    );

export class HksToolbar extends HTMLElement {
    readonly launches$: Observable<string>;
    readonly placements$: Observable<Placement>;
    readonly retracts$: Observable<void>;

    private readonly programs: HTMLElement;
    private readonly menu: HTMLDetailsElement;
    private readonly tab: HTMLElement;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.programs = requireChild(shadow, '.programs');
        this.menu = requireElement(shadow, '.menu', HTMLDetailsElement);
        this.tab = requireChild(shadow, '.tab');

        this.launches$ = clicked$(this.programs, 'program');
        this.placements$ = clicked$(this.menu, 'place').pipe(
            mergeMap(value => (isPlacement(value) ? of(value) : EMPTY)),
        );
        this.retracts$ = fromElementEvent$(this.tab, 'click').pipe(map(() => undefined));
    }

    items(items: readonly ToolbarItem[]): this {
        this.programs.replaceChildren(
            ...items.map(({ id, title, icon }) => {
                const tile = document.createElement('button');
                tile.type = 'button';
                tile.className = 'key tile';
                tile.dataset['program'] = id;
                tile.title = title;
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

    connect$(
        running$: Observable<ReadonlySet<string>>,
        view$: Observable<ToolbarView>,
    ): Observable<void> {
        return merge(
            running$.pipe(
                tap(running => {
                    for (const tile of this.programs.children) {
                        const id =
                            tile instanceof HTMLElement ? tile.dataset['program'] : undefined;
                        const active = id !== undefined && running.has(id);

                        tile.classList.toggle('running', active);
                        tile.setAttribute('aria-pressed', String(active));
                    }
                }),
            ),
            view$.pipe(
                distinctUntilChanged(sameToolbarView),
                tap(({ placement, retracted }) => {
                    this.dataset['placement'] = placement;
                    for (const choice of this.menu.querySelectorAll('[data-place]')) {
                        choice.setAttribute(
                            'aria-checked',
                            String(
                                choice instanceof HTMLElement &&
                                    choice.dataset['place'] === placement,
                            ),
                        );
                    }
                    this.toggleAttribute('data-retracted', retracted);
                    this.tab.setAttribute(
                        'aria-label',
                        retracted ? 'show toolbar' : 'hide toolbar',
                    );
                    this.tab.title = retracted ? 'show toolbar' : 'hide toolbar';
                    // The menu chose this placement; leaving it open would cover the tray.
                    this.menu.open = false;
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-toolbar', HksToolbar);
