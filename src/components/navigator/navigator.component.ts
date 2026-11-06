import { html } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { withValue } from '../../lib/lit.ts';
import { styleMap } from 'lit-html/directives/style-map.js';

import { renderView, type RenderView } from '../../lib/lit.ts';
import { EMPTY, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import type { Rect } from '../../shared/camera.ts';
import {
    isZoomCommand,
    MINIMAP,
    sameMiniMap,
    type MiniMap,
    type ZoomCommand,
} from './navigator.ts';
import css from './navigator.css?inline';

const sheet = styleSheet(css);

export type Edit = 'undo' | 'redo';

export type Undoable = {
    readonly undo: boolean;
    readonly redo: boolean;
};

const glyph = (d: string) =>
    html`<svg viewBox="0 0 24 24" aria-hidden="true"><path d=${ifDefined(d)}></path></svg>`;

const TEMPLATE = (map: MiniMap) =>
    html`<div class="map" aria-hidden="true">
            <div class="sections">
                ${repeat(
                    map.sections.map(section => section.id),
                    item => item,
                    id =>
                        withValue(
                            map.sections.find(section => section.id === id),
                            section =>
                                html`<span
                                    style=${styleMap({
                                        transform: `translate(${section.rect.x}px, ${section.rect.y}px)`,
                                        width: `${section.rect.width}px`,
                                        height: `${section.rect.height}px`,
                                    })}
                                    >${section.name}</span
                                >`,
                        ),
                )}
            </div>
            <div class="windows">
                ${repeat(
                    map.windows,
                    (_item, index) => index,
                    rect =>
                        html`<span
                            style=${styleMap({
                                transform: `translate(${rect.x}px, ${rect.y}px)`,
                                width: `${rect.width}px`,
                                height: `${rect.height}px`,
                            })}
                        ></span>`,
                )}
            </div>
            <div class="view"></div>
        </div>
        <div class="places" aria-label="sections">
            <div class="list">
                ${repeat(
                    map.sections.map(section => section.id),
                    item => item,
                    id =>
                        html`<button
                            type="button"
                            class="jump"
                            data-jump=${ifDefined(id)}
                            title=${ifDefined(`fly to ${map.sections.find(section => section.id === id)?.name}`)}
                        >
                            ${map.sections.find(section => section.id === id)?.name}
                        </button>`,
                )}
            </div>
            <button class="add" type="button" data-add title="new section around the view">
                + section
            </button>
        </div>
        <div class="row">
            <button
                class="key state-mode"
                type="button"
                aria-label="state mode"
                aria-pressed="false"
                title="State mode (hold W)"
            >
                ${glyph(
                    'M3 7 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M17 17 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M7 7 C13 7 11 17 17 17',
                )}<span>State</span></button
            ><button
                class="key edit"
                type="button"
                data-edit="undo"
                aria-label="undo"
                title="undo (⌘Z)"
                disabled
            >
                ${glyph('M9 14 L4 9 L9 4 M4 9 H15 A5 5 0 0 1 15 19 H11')}</button
            ><button
                class="key edit"
                type="button"
                data-edit="redo"
                aria-label="redo"
                title="redo (⇧⌘Z)"
                disabled
            >
                ${glyph('M15 14 L20 9 L15 4 M20 9 H9 A5 5 0 0 0 9 19 H13')}</button
            ><span class="divider" aria-hidden="true"></span
            ><button
                class="key"
                type="button"
                data-zoom="out"
                aria-label="zoom out"
                title="zoom out"
            >
                ${glyph('M7 12 H17')}</button
            ><button
                class="readout"
                type="button"
                data-zoom="reset"
                aria-label="reset zoom"
                title="reset zoom"
            >
                100%</button
            ><button class="key" type="button" data-zoom="in" aria-label="zoom in" title="zoom in">
                ${glyph('M7 12 H17 M12 7 V17')}</button
            ><button
                class="key"
                type="button"
                data-zoom="fit"
                aria-label="fit everything"
                title="fit everything"
            >
                ${glyph('M5 9 V5 H9 M15 5 H19 V9 M19 15 V19 H15 M9 19 H5 V15')}</button
            ><button
                class="key toggle"
                type="button"
                aria-label="show map"
                title="show map"
                aria-pressed="false"
            >
                ${glyph('M4 7 L9 5 L15 7 L20 5 V17 L15 19 L9 17 L4 19 Z M9 5 V17 M15 7 V19')}
            </button>
        </div>`;

const place = (element: HTMLElement, { x, y, width, height }: Rect): void => {
    element.style.transform = `translate(${x}px, ${y}px)`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
};

export class HksNavigator extends HTMLElement {
    readonly modes$: Observable<void>;
    readonly zooms$: Observable<ZoomCommand>;
    readonly toggles$: Observable<void>;
    readonly jumps$: Observable<string>;
    readonly adds$: Observable<void>;
    readonly edits$: Observable<Edit>;

    private readonly list: HTMLElement;
    private readonly view: HTMLElement;
    private readonly readout: HTMLElement;
    private readonly toggle: HTMLElement;
    private readonly shadow: ShadowRoot;

    private readonly rendering: RenderView<MiniMap>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        this.rendering = renderView<MiniMap>(
            shadow,
            { windows: [], sections: [], view: { x: 0, y: 0, width: 0, height: 0 } },
            TEMPLATE,
        );
        // From the constant the map is laid out in, so the map and the rows around it cannot drift apart.
        this.style.setProperty('--map-width', `${MINIMAP.width}px`);
        this.style.setProperty('--map-height', `${MINIMAP.height}px`);

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
        this.modes$ = fromElementEvent$(requireChild(shadow, '.state-mode'), 'click').pipe(
            map(() => undefined),
        );
        this.shadow = shadow;
    }

    connect$(
        map$: Observable<MiniMap>,
        zoom$: Observable<string>,
        open$: Observable<boolean>,
        history$: Observable<Undoable>,
        mode$: Observable<boolean>,
    ): Observable<void> {
        const undo = requireElement(this.shadow, '[data-edit="undo"]', HTMLButtonElement);
        const redo = requireElement(this.shadow, '[data-edit="redo"]', HTMLButtonElement);

        return merge(
            this.rendering.lifetime$,
            merge(
                mode$.pipe(
                    distinctUntilChanged(),
                    tap(active => {
                        const button = requireChild(this.shadow, '.state-mode');
                        button.setAttribute('aria-pressed', String(active));
                        button.title = active ? 'Default mode (Escape)' : 'State mode (hold W)';
                    }),
                ),
                history$.pipe(
                    distinctUntilChanged((a, b) => a.undo === b.undo && a.redo === b.redo),
                    tap(({ undo: canUndo, redo: canRedo }) => {
                        undo.disabled = !canUndo;
                        redo.disabled = !canRedo;
                    }),
                ),
                map$.pipe(
                    distinctUntilChanged(sameMiniMap),
                    tap(map => {
                        this.rendering.update(map);
                        place(this.view, map.view);
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
            ).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-navigator', HksNavigator);
