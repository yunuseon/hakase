import { controlsSheet } from '../../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { styleMap } from 'lit-html/directives/style-map.js';

import { mountView, renderView, type RenderView, type Rendering } from '../../../lib/lit.ts';
import { combineLatest, merge, type Observable } from 'rxjs';
import { filter, map, mergeMap, startWith, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../../lib/dom.ts';
import { fromElementEvent$, observeResize$ } from '../../../lib/rx.ts';
import { pointerGesture$, type Phase } from '../../../shared/drag.ts';
import { frameAt, markerX, type StripLayout, type Visible } from '../animation.ts';
import type { Filmstrip } from './thumbnails.ts';
import css from './frame-strip.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = () =>
    html`<div class="head">
            <span class="readout"
                >frame <span class="now"></span> / <span class="total"></span
            ></span>
            <div class="zoom" role="group" aria-label="zoom the frames">
                <button type="button" data-zoom="out" aria-label="zoom out" title="zoom out">
                    −</button
                ><button type="button" data-zoom="fit" title="fit the whole loop">fit</button
                ><button
                    type="button"
                    data-zoom="in"
                    aria-label="zoom in"
                    title="zoom in, down to single frames"
                >
                    +
                </button>
            </div>
        </div>
        <div class="scroller">
            <div class="track">
                <canvas class="film"></canvas>
                <div class="tiles"></div>
                <div class="playhead" aria-hidden="true"></div>
            </div>
        </div>`;

export class HksFrameStrip extends HTMLElement {
    readonly zooms$: Observable<string>;
    readonly pinches$: Observable<{ readonly factor: number; readonly x: number }>;
    // x in track pixels, from the left edge of the first tile.
    readonly seeks$: Observable<{ readonly phase: Phase; readonly x: number }>;
    readonly visible$: Observable<Visible>;

    private readonly scroller: HTMLElement;
    private readonly track: HTMLElement;
    private readonly tiles: HTMLElement;
    private readonly film: HTMLCanvasElement;
    private readonly playhead: HTMLElement;
    private readonly now: HTMLElement;
    private readonly total: HTMLElement;

    private readonly rendering: Rendering;

    private readonly tileView: RenderView<StripLayout | null>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());

        this.scroller = requireChild(shadow, '.scroller');
        this.track = requireChild(shadow, '.track');
        this.tiles = requireChild(shadow, '.tiles');
        this.tileView = renderView<StripLayout | null>(this.tiles, null, layout =>
            repeat(
                layout === null
                    ? []
                    : Array.from(
                          {
                              length: Math.max(
                                  0,
                                  (layout?.range.last ?? -1) - (layout?.range.first ?? 0) + 1,
                              ),
                          },
                          (_, offset) => (layout?.range.first ?? 0) + offset,
                      ),
                item => item,
                tile =>
                    html`<div
                        class="tile"
                        data-tile=${ifDefined(tile)}
                        style=${styleMap({
                            left: `${tile * (layout?.geometry.tileWidth ?? 0)}px`,
                            width: `${layout?.geometry.tileWidth ?? 0}px`,
                            height: `${layout?.geometry.tileHeight ?? 0}px`,
                        })}
                    >
                        <span class="number">${tile * (layout?.geometry.perTile ?? 0) + 1}</span>
                    </div>`,
            ),
        );
        this.film = requireElement(shadow, '.film', HTMLCanvasElement);
        this.playhead = requireChild(shadow, '.playhead');
        this.now = requireChild(shadow, '.now');
        this.total = requireChild(shadow, '.total');

        this.zooms$ = fromElementEvent$(requireChild(shadow, '.zoom'), 'click').pipe(
            mergeMap(({ target }) => {
                const button = target instanceof Element ? target.closest('[data-zoom]') : null;
                const zoom = button instanceof HTMLElement ? button.dataset['zoom'] : undefined;

                return zoom === undefined ? [] : [zoom];
            }),
        );

        const { track } = this;
        // offsetWidth over the client rect: the rect is in screen pixels, zoom included; the track is not.
        const trackX = (clientX: number): number => {
            const rect = track.getBoundingClientRect();

            return ((clientX - rect.left) * track.offsetWidth) / Math.max(rect.width, 1);
        };

        this.seeks$ = pointerGesture$(track).pipe(
            map(({ phase, event }) => ({ phase, x: trackX(event.clientX) })),
        );

        this.pinches$ = fromElementEvent$(this.scroller, 'wheel').pipe(
            filter(event => event.ctrlKey || event.metaKey),
            // Claimed here, so the canvas, which skips a handled wheel, does not zoom the whole workspace too.
            tap(event => {
                event.preventDefault();
            }),
            map(event => ({ factor: Math.exp(-event.deltaY / 100), x: trackX(event.clientX) })),
        );

        const { scroller } = this;
        this.visible$ = merge(fromElementEvent$(scroller, 'scroll'), observeResize$(scroller)).pipe(
            startWith(undefined),
            map((): Visible => ({ left: scroller.scrollLeft, width: scroller.clientWidth })),
        );
    }

    connect$(
        layout$: Observable<StripLayout>,
        playhead$: Observable<number>,
        filmstrip$: Observable<Filmstrip>,
        scroll$: Observable<number>,
    ): Observable<void> {
        // Updated in place: a pinch between whole levels moves and widens the tiles in view rather than rebuilding them.
        const shown$ = layout$.pipe(
            tap(layout => {
                const { geometry } = layout;
                this.total.textContent = String(geometry.frames);
                this.track.style.width = `${geometry.tiles * geometry.tileWidth}px`;
                this.track.style.height = `${geometry.tileHeight}px`;
                this.tileView.update(layout);
            }),
        );

        const film = this.film.getContext('bitmaprenderer');
        const painted$ = filmstrip$.pipe(
            tap(({ bitmap, left, width, height }) => {
                this.film.style.left = `${left}px`;
                this.film.style.width = `${width}px`;
                this.film.style.height = `${height}px`;
                // transferFromImageBitmap takes the bitmap over, so there is nothing left to close.
                film?.transferFromImageBitmap(bitmap);
            }),
        );

        const current$ = combineLatest([shown$, playhead$]).pipe(
            map(([{ geometry }, t]) => {
                const frame = frameAt(t, geometry.frames);

                return {
                    tile: Math.floor(frame / geometry.perTile),
                    frame,
                    x: markerX(t, geometry),
                };
            }),
            tap(({ tile, frame, x }) => {
                this.playhead.style.transform = `translateX(${x}px)`;
                this.now.textContent = String(frame + 1);
                [...this.tiles.children].forEach(element => {
                    element.toggleAttribute(
                        'data-current',
                        element instanceof HTMLElement && element.dataset['tile'] === String(tile),
                    );
                });
            }),
        );

        const scrolled$ = scroll$.pipe(
            tap(left => {
                this.scroller.scrollLeft = left;
            }),
        );

        return merge(
            this.rendering.lifetime$,
            this.tileView.lifetime$,
            merge(painted$, current$, scrolled$).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-frame-strip', HksFrameStrip);
