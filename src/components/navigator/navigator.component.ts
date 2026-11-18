import { areaFill, areaOutline, boundsOf } from '../../shared/area.ts';
import { Icon } from '../../shared/ui/icon.component.ts';
import { ICONS } from '../../shared/ui/icons.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html, svg } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { styleMap } from 'lit-html/directives/style-map.js';

import { renderView, type RenderView } from '../../lib/lit.ts';
import { EMPTY, fromEvent, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, startWith, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { MINIMAP, sameMiniMap, type MiniMap } from './navigator.ts';
import { isZoomCommand, type ZoomCommand } from '../../layout/zoom.ts';
import css from './navigator.css?inline';

const sheet = styleSheet(css);

export type Edit = 'undo' | 'redo';

export type Undoable = {
    readonly undo: boolean;
    readonly redo: boolean;
};

const TEMPLATE = (map: MiniMap) =>
    html` <nav class="navigator" aria-label="Workspace controls">
        <div class="launcher"><slot name="launcher"></slot></div>
        <div class="map" id="navigation-map">
            <svg
                class="miniature"
                viewBox=${`0 0 ${MINIMAP.width} ${MINIMAP.height}`}
                aria-hidden="true"
                focusable="false"
            >
                ${repeat(
                    map.sections,
                    section => section.id,
                    section =>
                        svg`<path class="section-outline" d=${areaFill(section.rects)}></path><path class="section-edge" d=${areaOutline(section.rects)}></path>`,
                )}
                <g class="windows">
                    ${repeat(
                        map.windows,
                        (_rect, index) => index,
                        rect =>
                            svg`<rect class="window" x=${rect.x} y=${rect.y} width=${rect.width} height=${rect.height} rx="3"></rect>`,
                    )}
                </g>
                <rect
                    class="viewport"
                    x=${map.view.x}
                    y=${map.view.y}
                    width=${map.view.width}
                    height=${map.view.height}
                    rx="5"
                ></rect>
            </svg>
            <div class="sections">
                ${repeat(
                    map.sections,
                    section => section.id,
                    section => {
                        const bounds = boundsOf(section.rects);
                        const label = section.rects[0] ?? bounds;
                        return html`<button
                            type="button"
                            class="jump"
                            data-jump=${section.id}
                            title=${`Fly to ${section.name}`}
                            aria-label=${`Fly to ${section.name}`}
                            style=${styleMap({ left: `${(bounds.x / MINIMAP.width) * 100}%`, top: `${(bounds.y / MINIMAP.height) * 100}%`, width: `${(bounds.width / MINIMAP.width) * 100}%`, height: `${(bounds.height / MINIMAP.height) * 100}%` })}
                        >
                            <svg
                                class="jump-area"
                                viewBox=${`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
                                preserveAspectRatio="none"
                                aria-hidden="true"
                                focusable="false"
                            >
                                <path d=${areaFill(section.rects)}></path>
                            </svg>
                            <span
                                style=${styleMap({ left: `${((label.x - bounds.x) / bounds.width) * 100}%`, top: `${((label.y - bounds.y) / bounds.height) * 100}%`, maxWidth: `${(label.width / bounds.width) * 100}%` })}
                                >${section.name}</span
                            >
                        </button>`;
                    },
                )}
            </div>
        </div>
        <button
            class="ui-button state-mode"
            type="button"
            aria-label="state mode"
            aria-pressed="false"
            title="State mode (hold W)"
        >
            ${Icon(ICONS.wire)}<span>State</span>
        </button>
        <div class="history expanded-control" role="group" aria-label="History">
            <button
                class="ui-icon key"
                type="button"
                data-edit="undo"
                aria-label="undo"
                title="Undo (⌘Z)"
                disabled
            >
                ${Icon(ICONS.undo)}
            </button>
            <button
                class="ui-icon key"
                type="button"
                data-edit="redo"
                aria-label="redo"
                title="Redo (⇧⌘Z)"
                disabled
            >
                ${Icon(ICONS.redo)}
            </button>
        </div>
        <div class="area-tools expanded-control" role="group" aria-label="Workspace tools">
            <button
                class="ui-icon add"
                type="button"
                aria-label="paint section area"
                title="Paint section area"
            >
                ${Icon(ICONS.area)}
            </button>
            <button
                class="ui-icon erase"
                type="button"
                aria-label="erase section area"
                title="Erase section area"
            >
                ${Icon(ICONS.erase)}
            </button>
            <button
                class="ui-icon select"
                type="button"
                aria-label="select programs"
                title="Select programs to copy or save as blueprint"
            >
                ${Icon(ICONS.marquee)}
            </button>
        </div>
        <div class="zoom-controls" role="group" aria-label="Zoom">
            <button
                class="ui-icon key expanded-control"
                type="button"
                data-zoom="out"
                aria-label="zoom out"
                title="Zoom out"
            >
                ${Icon(ICONS.zoomOut)}
            </button>
            <button
                class="ui-button readout"
                type="button"
                data-zoom="reset"
                aria-label="reset zoom"
                title="Reset zoom"
            >
                100%
            </button>
            <button
                class="ui-icon key expanded-control"
                type="button"
                data-zoom="in"
                aria-label="zoom in"
                title="Zoom in"
            >
                ${Icon(ICONS.zoomIn)}
            </button>
            <button
                class="ui-icon key expanded-control"
                type="button"
                data-zoom="fit"
                aria-label="fit everything"
                title="Fit everything"
            >
                ${Icon(ICONS.fit)}
            </button>
        </div>
        <button
            class="ui-icon toggle"
            type="button"
            aria-label="expand navigation"
            title="Expand navigation"
            aria-expanded="false"
            aria-controls="navigation-map"
        >
            ${Icon(ICONS.collapse)}
        </button>
    </nav>`;

export class HksNavigator extends HTMLElement {
    readonly modes$: Observable<void>;
    readonly zooms$: Observable<ZoomCommand>;
    readonly toggles$: Observable<void>;
    readonly jumps$: Observable<string>;
    readonly adds$: Observable<void>;
    readonly erases$: Observable<void>;
    readonly selects$: Observable<void>;
    readonly edits$: Observable<Edit>;

    private readonly readout: HTMLElement;
    private readonly toggle: HTMLElement;
    private readonly shadow: ShadowRoot;

    private readonly rendering: RenderView<MiniMap>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<MiniMap>(
            shadow,
            { windows: [], sections: [], view: { x: 0, y: 0, width: 0, height: 0 } },
            TEMPLATE,
        );
        // Section hit targets must keep the same aspect ratio as the SVG viewBox.
        this.style.setProperty('--map-aspect', String(MINIMAP.width / MINIMAP.height));

        const frame = requireChild(shadow, '.navigator');
        this.jumps$ = fromElementEvent$(frame, 'click').pipe(
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
        this.erases$ = fromElementEvent$(requireChild(shadow, '.erase'), 'click').pipe(
            map(() => undefined),
        );
        this.selects$ = fromElementEvent$(requireChild(shadow, '.select'), 'click').pipe(
            map(() => undefined),
        );
        this.readout = requireChild(shadow, '.readout');
        this.toggle = requireChild(shadow, '.toggle');

        this.zooms$ = fromElementEvent$(frame, 'click').pipe(
            mergeMap(event => {
                const button =
                    event.target instanceof Element ? event.target.closest('[data-zoom]') : null;
                const value = button instanceof HTMLElement ? button.dataset['zoom'] : undefined;

                return value !== undefined && isZoomCommand(value) ? of(value) : EMPTY;
            }),
        );

        this.toggles$ = fromElementEvent$(this.toggle, 'click').pipe(map(() => undefined));
        this.edits$ = fromElementEvent$(frame, 'click').pipe(
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
        const launcher = requireElement(this.shadow, 'slot[name="launcher"]', HTMLSlotElement);
        const undo = requireElement(this.shadow, '[data-edit="undo"]', HTMLButtonElement);
        const redo = requireElement(this.shadow, '[data-edit="redo"]', HTMLButtonElement);

        return merge(
            this.rendering.lifetime$,
            fromEvent(launcher, 'slotchange').pipe(
                startWith(undefined),
                map(() => launcher.assignedElements().length > 0),
                distinctUntilChanged(),
                tap(present => {
                    this.toggleAttribute('data-launcher', present);
                }),
                map(() => undefined),
            ),
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
                        const focused = this.shadow.activeElement;
                        const expandingFromToggle = open && focused === this.toggle;
                        const hidingFocused =
                            !open &&
                            focused instanceof HTMLElement &&
                            (focused.matches('.jump') ||
                                focused.closest('.expanded-control') !== null);
                        this.toggleAttribute('data-open', open);
                        this.toggle.setAttribute('aria-expanded', String(open));
                        this.toggle.setAttribute(
                            'aria-label',
                            open ? 'collapse navigation' : 'expand navigation',
                        );
                        this.toggle.title = open ? 'Collapse navigation' : 'Expand navigation';
                        if (expandingFromToggle) {
                            const first = this.shadow.querySelector(
                                '.jump, .expanded-control button:not(:disabled), button.expanded-control:not(:disabled)',
                            );
                            if (first instanceof HTMLElement) {
                                first.focus();
                            }
                        } else if (hidingFocused) {
                            this.toggle.focus();
                        }
                    }),
                ),
            ).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-navigator', HksNavigator);
