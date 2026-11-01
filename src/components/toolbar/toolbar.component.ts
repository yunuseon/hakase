import { EMPTY, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, filter, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
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

export type ToolbarCategory = ToolbarItem & {
    readonly items: readonly ToolbarItem[];
};

// Built as nodes, not markup: an icon is path data, never HTML.
const iconOf = (icon: string): SVGSVGElement => {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', icon);
    svg.append(path);

    return svg;
};

const categoryOf = ({ title, icon, items }: ToolbarCategory): HTMLElement => {
    const menu = document.createElement('details');
    menu.className = 'category';

    const key = document.createElement('summary');
    key.className = 'key';
    key.title = title;
    key.setAttribute('aria-label', title);
    key.append(iconOf(icon));

    const list = document.createElement('div');
    list.className = 'places';
    list.setAttribute('role', 'menu');
    list.setAttribute('aria-label', title);

    const heading = document.createElement('p');
    heading.className = 'places-title';
    heading.textContent = title;
    list.append(heading);

    for (const item of items) {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'choice';
        choice.dataset['program'] = item.id;
        choice.setAttribute('role', 'menuitem');
        choice.title = `new ${item.title}`;

        const label = document.createElement('span');
        label.textContent = item.title;
        choice.append(iconOf(item.icon), label);
        list.append(choice);
    }

    menu.append(key, list);

    return menu;
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
    private readonly shadow: ShadowRoot;
    private readonly tray: HTMLElement;
    private readonly menu: HTMLDetailsElement;
    private readonly tab: HTMLElement;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.shadow = shadow;
        this.tray = requireChild(shadow, '.tray');
        this.programs = requireChild(shadow, '.programs');
        this.menu = requireElement(shadow, '.menu', HTMLDetailsElement);
        this.tab = requireChild(shadow, '.tab');

        this.launches$ = clicked$(this.programs, 'program');
        this.placements$ = clicked$(this.menu, 'place').pipe(
            mergeMap(value => (isPlacement(value) ? of(value) : EMPTY)),
        );
        this.retracts$ = fromElementEvent$(this.tab, 'click').pipe(map(() => undefined));
    }

    categories(categories: readonly ToolbarCategory[]): this {
        this.programs.replaceChildren(...categories.map(categoryOf));

        return this;
    }

    connect$(view$: Observable<ToolbarView>): Observable<void> {
        const menus = (): HTMLDetailsElement[] =>
            [...this.shadow.querySelectorAll('details')].filter(
                menu => menu instanceof HTMLDetailsElement,
            );
        const closeAll = (except: Element | null = null): void => {
            for (const menu of menus()) {
                if (menu !== except) {
                    menu.open = false;
                }
            }
        };

        return merge(
            // Captured: `toggle` does not bubble. One menu at a time, or two flyouts would overlap.
            fromElementEvent$(this.tray, 'toggle', { capture: true }).pipe(
                tap(({ target }) => {
                    if (target instanceof HTMLDetailsElement && target.open) {
                        closeAll(target);
                    }
                }),
            ),
            merge(
                this.launches$,
                fromDocumentEvent$('pointerdown').pipe(
                    filter(event => !event.composedPath().includes(this)),
                ),
                fromDocumentEvent$('keydown').pipe(filter(({ key }) => key === 'Escape')),
            ).pipe(
                tap(() => {
                    closeAll();
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
