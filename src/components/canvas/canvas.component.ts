import { EMPTY, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import { pointerDelta$ } from '../../shared/drag.ts';
import type { Camera } from './camera.ts';
import {
    gridOf,
    keyZoom,
    sameVariables,
    wheelGesture,
    type CanvasGesture,
    type KeyZoom,
} from './canvas.ts';
import css from './canvas.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <div class="ground"></div>
    <div class="world"><slot></slot></div>
    <slot name="chrome"></slot>
`;

export class HksCanvas extends HTMLElement {
    readonly gestures$: Observable<CanvasGesture>;
    readonly keys$: Observable<KeyZoom>;

    private readonly ground: HTMLElement;
    private readonly world: HTMLElement;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.ground = requireChild(shadow, '.ground');
        this.world = requireChild(shadow, '.world');

        this.gestures$ = merge(
            pointerDelta$(this.ground).pipe(
                map(({ dx, dy }): CanvasGesture => ({ kind: 'pan', dx, dy })),
            ),
            fromElementEvent$(this, 'wheel').pipe(
                mergeMap(event => {
                    const gesture = wheelGesture({
                        deltaX: event.deltaX,
                        deltaY: event.deltaY,
                        lines: event.deltaMode === WheelEvent.DOM_DELTA_LINE,
                        pinch: event.ctrlKey || event.metaKey,
                        // Retargeted: a wheel over the ground reads as the canvas itself.
                        onGround: event.target === this,
                        at: { x: event.clientX, y: event.clientY },
                    });

                    if (gesture === null) {
                        return EMPTY;
                    }

                    // Otherwise ctrl+wheel zooms the whole browser page as well.
                    event.preventDefault();

                    return of(gesture);
                }),
            ),
        );

        this.keys$ = fromDocumentEvent$('keydown').pipe(
            mergeMap(event => {
                const zoom = keyZoom(event.key, event.ctrlKey || event.metaKey);

                if (zoom === null) {
                    return EMPTY;
                }

                event.preventDefault();

                return of(zoom);
            }),
        );
    }

    connect$(
        camera$: Observable<Camera>,
        variables$: Observable<ReadonlyMap<string, string>>,
    ): Observable<void> {
        return merge(
            // On the host, so every window and the toolbar inherit them across their shadow roots.
            variables$.pipe(
                distinctUntilChanged(sameVariables),
                tap(variables => {
                    for (const [name, value] of variables) {
                        this.style.setProperty(name, value);
                    }
                }),
            ),
            camera$.pipe(
                map(({ x, y, zoom }) => `translate(${x}px, ${y}px) scale(${zoom})`),
                distinctUntilChanged(),
                tap(transform => {
                    this.world.style.transform = transform;
                }),
            ),
            camera$.pipe(
                map(camera => `${gridOf(camera).size}px`),
                distinctUntilChanged(),
                tap(size => {
                    this.ground.style.backgroundSize = `${size} ${size}`;
                }),
            ),
            camera$.pipe(
                map(camera => {
                    const { x, y } = gridOf(camera);

                    return `${x}px ${y}px`;
                }),
                distinctUntilChanged(),
                tap(position => {
                    this.ground.style.backgroundPosition = position;
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-canvas', HksCanvas);
