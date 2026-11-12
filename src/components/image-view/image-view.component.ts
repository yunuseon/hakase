import { html } from 'lit-html';
import { merge, of, type Observable } from 'rxjs';
import { filter, map, tap } from 'rxjs/operators';
import { mountView, type Rendering } from '../../lib/lit.ts';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { observeResize$ } from '../../lib/rx.ts';
import type { Size } from '../window/frame.ts';
import type { Shown } from '../../shared/shown.ts';
import css from './image-view.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = () =>
    html`<div class="viewport">
            <canvas></canvas>
            <p class="message" hidden></p>
        </div>
        <slot name="controls"></slot>`;

export class HksImageView extends HTMLElement {
    readonly sizes$: Observable<Size>;

    private readonly canvas: HTMLCanvasElement;
    private readonly message: HTMLElement;
    private readonly rendering: Rendering;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());

        const viewport = requireChild(shadow, '.viewport');
        this.canvas = requireElement(shadow, 'canvas', HTMLCanvasElement);
        this.message = requireChild(shadow, '.message');

        this.sizes$ = merge(of(undefined), observeResize$(viewport)).pipe(
            map((): Size => ({ width: viewport.clientWidth, height: viewport.clientHeight })),
            filter(({ width, height }) => width > 0 && height > 0),
        );
    }

    connect$(shown$: Observable<Shown>): Observable<void> {
        const context = this.canvas.getContext('bitmaprenderer');

        return merge(
            this.rendering.lifetime$,
            shown$.pipe(
                tap(shown => {
                    this.message.hidden = shown.kind === 'frame';

                    if (shown.kind === 'frame') {
                        context?.transferFromImageBitmap(shown.bitmap);
                    } else {
                        this.message.textContent = shown.text;
                        context?.transferFromImageBitmap(null);
                    }
                }),
                map(() => undefined),
            ),
        );
    }
}

customElements.define('hks-image-view', HksImageView);
