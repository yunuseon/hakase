import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { mountView, type Rendering } from '../../lib/lit.ts';
import { merge, of, type Observable } from 'rxjs';
import { filter, map, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$, observeResize$ } from '../../lib/rx.ts';
import { pointerDelta$, pointerDrag$ } from '../../shared/drag.ts';
import type { OrbitAction } from './space.ts';
import { pointerAt, type Pointer } from './params.ts';
import type { Size } from '../window/frame.ts';
import type { Shown } from '../../shared/shown.ts';
import css from './sketch.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = () =>
    html`<div class="viewport">
            <canvas></canvas>
            <p class="message" hidden></p>
            <slot name="status"></slot>
        </div>
        <slot name="controls"></slot>`;

export class HksSketch extends HTMLElement {
    readonly pointers$: Observable<Omit<Pointer, 'down'>>;
    readonly presses$: Observable<boolean>;
    readonly orbits$: Observable<OrbitAction>;
    readonly sizes$: Observable<Size>;

    private readonly canvas: HTMLCanvasElement;
    private readonly message: HTMLElement;
    private readonly rendering: Rendering;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());

        const viewport = requireChild(shadow, '.viewport');
        const canvas = requireElement(shadow, 'canvas', HTMLCanvasElement);
        this.canvas = canvas;
        this.message = requireChild(shadow, '.message');

        // getBoundingClientRect, not offset*: the pointer is in screen pixels, zoom included.
        this.pointers$ = fromElementEvent$(canvas, 'pointermove').pipe(
            map(event => pointerAt(event.clientX, event.clientY, canvas.getBoundingClientRect())),
        );

        // Shift turns a drag into a press the formula can read, so it must not also orbit.
        const pressing = (start: PointerEvent): boolean => start.shiftKey;

        this.presses$ = merge(
            pointerDrag$(canvas, pressing).pipe(map(() => true)),
            fromDocumentEvent$('pointerup').pipe(map(() => false)),
            fromDocumentEvent$('pointercancel').pipe(map(() => false)),
        );

        // client*, not the client rect: the rect includes the canvas zoom, and a size here is in world units.
        this.sizes$ = merge(of(undefined), observeResize$(viewport)).pipe(
            map((): Size => ({ width: viewport.clientWidth, height: viewport.clientHeight })),
            filter(({ width, height }) => width > 0 && height > 0),
        );

        this.orbits$ = merge(
            pointerDelta$(canvas, start => !pressing(start)).pipe(
                map(({ dx, dy }): OrbitAction => ({ kind: 'turn', dx, dy })),
            ),
            fromElementEvent$(canvas, 'wheel').pipe(
                // A pinch arrives as ctrl+wheel and belongs to the canvas zoom, not the camera.
                filter(event => !event.ctrlKey && !event.metaKey),
                map((event): OrbitAction => ({ kind: 'dolly', delta: event.deltaY })),
            ),
            fromElementEvent$(canvas, 'dblclick').pipe(map((): OrbitAction => ({ kind: 'reset' }))),
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
                    }
                }),
                map(() => undefined),
            ),
        );
    }
}

customElements.define('hks-sketch', HksSketch);
