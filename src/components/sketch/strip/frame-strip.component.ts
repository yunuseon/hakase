import { combineLatest, merge, type Observable } from 'rxjs';
import { filter, map, mergeMap, startWith, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../../lib/dom.ts';
import { fromElementEvent$, observeResize$ } from '../../../lib/rx.ts';
import { pointerDrag$ } from '../../../shared/drag.ts';
import {
    frameAt,
    markerX,
    type StripGeometry,
    type StripLayout,
    type Visible,
} from '../animation.ts';
import type { Filmstrip } from './thumbnails.ts';
import css from './frame-strip.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <div class="head">
        <span class="readout">frame <span class="now"></span> / <span class="total"></span></span>
        <div class="zoom" role="group" aria-label="zoom the frames">
            <button type="button" data-zoom="out" aria-label="zoom out" title="zoom out">−</button>
            <button type="button" data-zoom="fit" title="fit the whole loop">fit</button>
            <button type="button" data-zoom="in" aria-label="zoom in" title="zoom in, down to single frames">+</button>
        </div>
    </div>
    <div class="scroller">
        <div class="track">
            <canvas class="film"></canvas>
            <div class="tiles"></div>
            <div class="playhead" aria-hidden="true"></div>
        </div>
    </div>
`;

// Tiles are rebuilt only when what a tile stands for changes; a pinch between whole levels only widens them.
const framingOf = ({ frames, perTile, tileHeight }: StripGeometry): string =>
    `${frames}:${perTile}:${tileHeight}`;

const place = (
    element: HTMLElement,
    tile: number,
    { tileWidth, tileHeight }: StripGeometry,
): void => {
    element.style.left = `${tile * tileWidth}px`;
    element.style.width = `${tileWidth}px`;
    element.style.height = `${tileHeight}px`;
};

const tileOf = (tile: number, geometry: StripGeometry): HTMLElement => {
    const element = document.createElement('div');
    element.className = 'tile';
    element.dataset['tile'] = String(tile);
    place(element, tile, geometry);

    const number = document.createElement('span');
    number.className = 'number';
    number.textContent = String(tile * geometry.perTile + 1);

    element.append(number);

    return element;
};

export class HksFrameStrip extends HTMLElement {
    readonly zooms$: Observable<string>;
    readonly pinches$: Observable<{ readonly factor: number; readonly x: number }>;
    // x in track pixels, from the left edge of the first tile.
    readonly seeks$: Observable<number>;
    readonly visible$: Observable<Visible>;

    private readonly scroller: HTMLElement;
    private readonly track: HTMLElement;
    private readonly tiles: HTMLElement;
    private readonly film: HTMLCanvasElement;
    private readonly playhead: HTMLElement;
    private readonly now: HTMLElement;
    private readonly total: HTMLElement;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.scroller = requireChild(shadow, '.scroller');
        this.track = requireChild(shadow, '.track');
        this.tiles = requireChild(shadow, '.tiles');
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

        this.seeks$ = pointerDrag$(track).pipe(map(event => trackX(event.clientX)));

        this.pinches$ = fromElementEvent$(this.scroller, 'wheel').pipe(
            filter(event => event.ctrlKey || event.metaKey),
            map(event => {
                // Claimed here, so the canvas, which skips a handled wheel, does not zoom the whole workspace too.
                event.preventDefault();

                return { factor: Math.exp(-event.deltaY / 100), x: trackX(event.clientX) };
            }),
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
            tap(({ geometry, range: { first, last } }) => {
                const framing = framingOf(geometry);

                if (this.tiles.dataset['framing'] !== framing) {
                    this.tiles.dataset['framing'] = framing;
                    this.tiles.replaceChildren();
                    this.total.textContent = String(geometry.frames);
                }

                this.track.style.width = `${geometry.tiles * geometry.tileWidth}px`;
                this.track.style.height = `${geometry.tileHeight}px`;

                const present = new Set(
                    [...this.tiles.children].flatMap(tile => {
                        const index =
                            tile instanceof HTMLElement ? Number(tile.dataset['tile']) : NaN;

                        if (
                            !(tile instanceof HTMLElement) ||
                            Number.isNaN(index) ||
                            index < first ||
                            index > last
                        ) {
                            tile.remove();

                            return [];
                        }

                        place(tile, index, geometry);

                        return [index];
                    }),
                );

                const missing = Array.from(
                    { length: Math.max(0, last - first + 1) },
                    (_, offset) => first + offset,
                )
                    .filter(index => !present.has(index))
                    .map(index => tileOf(index, geometry));
                this.tiles.append(...missing);
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

        return merge(painted$, current$, scrolled$).pipe(map(() => undefined));
    }
}

customElements.define('hks-frame-strip', HksFrameStrip);
