import { EMPTY, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import type { Rect } from '../../shared/camera.ts';
import { isZoomCommand, sameMiniMap, type MiniMap, type ZoomCommand } from './navigator.ts';
import css from './navigator.css?inline';

const sheet = styleSheet(css);

export type Edit = 'undo' | 'redo';

export type Undoable = {
    readonly undo: boolean;
    readonly redo: boolean;
};

const glyph = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

const TEMPLATE = `
    <div class="map" aria-hidden="true">
        <div class="sections"></div>
        <div class="windows"></div>
        <div class="view"></div>
    </div>
    <div class="places" aria-label="sections">
        <div class="list"></div>
        <button class="add" type="button" data-add title="new section around the view">+ section</button>
    </div>
    <div class="row">
        <button class="key edit" type="button" data-edit="undo" aria-label="undo" title="undo (⌘Z)" disabled>${glyph('M9 14 L4 9 L9 4 M4 9 H15 A5 5 0 0 1 15 19 H11')}</button>
        <button class="key edit" type="button" data-edit="redo" aria-label="redo" title="redo (⇧⌘Z)" disabled>${glyph('M15 14 L20 9 L15 4 M20 9 H9 A5 5 0 0 0 9 19 H13')}</button>
        <span class="divider" aria-hidden="true"></span>
        <button class="key" type="button" data-zoom="out" aria-label="zoom out" title="zoom out">${glyph('M7 12 H17')}</button>
        <button class="readout" type="button" data-zoom="reset" aria-label="reset zoom" title="reset zoom">100%</button>
        <button class="key" type="button" data-zoom="in" aria-label="zoom in" title="zoom in">${glyph('M7 12 H17 M12 7 V17')}</button>
        <button class="key" type="button" data-zoom="fit" aria-label="fit everything" title="fit everything">${glyph('M5 9 V5 H9 M15 5 H19 V9 M19 15 V19 H15 M9 19 H5 V15')}</button>
        <button class="key toggle" type="button" aria-label="show map" title="show map" aria-pressed="false">${glyph('M4 7 L9 5 L15 7 L20 5 V17 L15 19 L9 17 L4 19 Z M9 5 V17 M15 7 V19')}</button>
    </div>
`;

const place = (element: HTMLElement, { x, y, width, height }: Rect): void => {
    element.style.transform = `translate(${x}px, ${y}px)`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
};

export class HksNavigator extends HTMLElement {
    readonly zooms$: Observable<ZoomCommand>;
    readonly toggles$: Observable<void>;
    readonly jumps$: Observable<string>;
    readonly adds$: Observable<void>;
    readonly edits$: Observable<Edit>;

    private readonly windows: HTMLElement;
    private readonly outlines: HTMLElement;
    private readonly list: HTMLElement;
    private readonly view: HTMLElement;
    private readonly readout: HTMLElement;
    private readonly toggle: HTMLElement;
    private readonly shadow: ShadowRoot;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.windows = requireChild(shadow, '.windows');
        this.outlines = requireChild(shadow, '.sections');
        this.list = requireChild(shadow, '.list');

        this.jumps$ = fromElementEvent$(this.list, 'click').pipe(
            mergeMap(event => {
                const button =
                    event.target instanceof Element ? event.target.closest('[data-jump]') : null;
                const id = button instanceof HTMLElement ? button.dataset['jump'] : undefined;

                return id === undefined ? EMPTY : of(id);
            }),
        );
        this.adds$ = fromElementEvent$(requireChild(shadow, '.add'), 'click').pipe(
            map(() => undefined),
        );
        this.view = requireChild(shadow, '.view');
        this.readout = requireChild(shadow, '.readout');
        this.toggle = requireChild(shadow, '.toggle');

        this.zooms$ = fromElementEvent$(requireChild(shadow, '.row'), 'click').pipe(
            mergeMap(event => {
                const button =
                    event.target instanceof Element ? event.target.closest('[data-zoom]') : null;
                const value = button instanceof HTMLElement ? button.dataset['zoom'] : undefined;

                return value !== undefined && isZoomCommand(value) ? of(value) : EMPTY;
            }),
        );

        this.toggles$ = fromElementEvent$(this.toggle, 'click').pipe(map(() => undefined));
        this.edits$ = fromElementEvent$(requireChild(shadow, '.row'), 'click').pipe(
            mergeMap((event): Observable<Edit> => {
                const button =
                    event.target instanceof Element ? event.target.closest('[data-edit]') : null;
                const value = button instanceof HTMLElement ? button.dataset['edit'] : undefined;

                return value === 'undo' || value === 'redo' ? of(value) : EMPTY;
            }),
        );
        this.shadow = shadow;
    }

    connect$(
        map$: Observable<MiniMap>,
        zoom$: Observable<string>,
        open$: Observable<boolean>,
        history$: Observable<Undoable>,
    ): Observable<void> {
        const undo = requireElement(this.shadow, '[data-edit="undo"]', HTMLButtonElement);
        const redo = requireElement(this.shadow, '[data-edit="redo"]', HTMLButtonElement);

        return merge(
            history$.pipe(
                distinctUntilChanged((a, b) => a.undo === b.undo && a.redo === b.redo),
                tap(({ undo: canUndo, redo: canRedo }) => {
                    undo.disabled = !canUndo;
                    redo.disabled = !canRedo;
                }),
            ),
            map$.pipe(
                distinctUntilChanged(sameMiniMap),
                tap(({ windows, sections, view }) => {
                    this.outlines.replaceChildren(
                        ...sections.map(({ name, rect }) => {
                            const outline = document.createElement('span');
                            outline.textContent = name;
                            place(outline, rect);

                            return outline;
                        }),
                    );
                    this.list.replaceChildren(
                        ...sections.map(({ id, name }) => {
                            const jump = document.createElement('button');
                            jump.type = 'button';
                            jump.className = 'jump';
                            jump.dataset['jump'] = id;
                            jump.textContent = name;
                            jump.title = `fly to ${name}`;

                            return jump;
                        }),
                    );

                    while (this.windows.children.length < windows.length) {
                        this.windows.append(document.createElement('span'));
                    }

                    while (this.windows.children.length > windows.length) {
                        this.windows.lastElementChild?.remove();
                    }

                    windows.forEach((rect, index) => {
                        const tile = this.windows.children[index];

                        if (tile instanceof HTMLElement) {
                            place(tile, rect);
                        }
                    });

                    place(this.view, view);
                }),
            ),
            zoom$.pipe(
                distinctUntilChanged(),
                tap(label => {
                    this.readout.textContent = label;
                }),
            ),
            open$.pipe(
                distinctUntilChanged(),
                tap(open => {
                    this.toggleAttribute('data-open', open);
                    this.toggle.setAttribute('aria-pressed', String(open));
                    this.toggle.setAttribute('aria-label', open ? 'hide map' : 'show map');
                    this.toggle.title = open ? 'hide map' : 'show map';
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-navigator', HksNavigator);
