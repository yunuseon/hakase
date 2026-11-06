import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { mountView, type Rendering } from '../../lib/lit.ts';
import { EMPTY, fromEvent, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { wheelGesture, type ViewGesture } from '../../shared/wheel.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import { pointerDelta$ } from '../../shared/drag.ts';
import type { Camera } from '../../shared/camera.ts';
import {
    gridOf,
    isEditable,
    keyEdit,
    keyStep,
    keyStateHold,
    keyZoom,
    sameVariables,
    type KeyEdit,
    type KeyStep,
    type KeyZoom,
} from './canvas.ts';
import css from './canvas.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = () =>
    html`<div class="ground"></div>
        <div class="world"><slot></slot></div>
        <slot name="chrome"></slot>`;

export class HksCanvas extends HTMLElement {
    readonly stateHolds$: Observable<boolean>;
    readonly blurs$: Observable<void>;
    readonly escapes$: Observable<void>;
    readonly gestures$: Observable<ViewGesture>;
    readonly keys$: Observable<KeyZoom>;
    readonly edits$: Observable<KeyEdit>;
    readonly steps$: Observable<KeyStep>;

    private readonly ground: HTMLElement;
    private readonly world: HTMLElement;

    private readonly rendering: Rendering;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());

        this.stateHolds$ = merge(
            fromDocumentEvent$('keydown').pipe(
                mergeMap(event =>
                    keyStateHold(
                        event.code,
                        event.ctrlKey || event.metaKey || event.altKey || event.shiftKey,
                        event.repeat,
                        isEditable(event.composedPath()[0] ?? null),
                    )
                        ? of(true)
                        : EMPTY,
                ),
            ),
            fromDocumentEvent$('keyup').pipe(
                mergeMap(event => (event.code === 'KeyW' ? of(false) : EMPTY)),
            ),
        );
        this.blurs$ = merge(
            fromEvent(window, 'blur'),
            fromDocumentEvent$('visibilitychange').pipe(
                mergeMap(() => (document.hidden ? of(undefined) : EMPTY)),
            ),
        ).pipe(map(() => undefined));
        this.escapes$ = fromDocumentEvent$('keydown').pipe(
            mergeMap(event => (event.key === 'Escape' ? of(undefined) : EMPTY)),
        );
        this.ground = requireChild(shadow, '.ground');
        this.world = requireChild(shadow, '.world');

        this.gestures$ = merge(
            pointerDelta$(this.ground).pipe(
                map(({ dx, dy }): ViewGesture => ({ kind: 'pan', dx, dy })),
            ),
            fromElementEvent$(this, 'wheel').pipe(
                mergeMap(event => {
                    // Handled already: a window that zooms its own content, like the frame strip, keeps the pinch.
                    if (event.defaultPrevented) {
                        return EMPTY;
                    }

                    const gesture = wheelGesture({
                        deltaX: event.deltaX,
                        deltaY: event.deltaY,
                        lines: event.deltaMode === WheelEvent.DOM_DELTA_LINE,
                        pinch: event.ctrlKey || event.metaKey,
                        // Retargeted: a wheel over the ground reads as the canvas itself, or an overlay standing in for it.
                        onGround:
                            event.target === this ||
                            (event.target instanceof HTMLElement &&
                                'ground' in event.target.dataset),
                        at: { x: event.clientX, y: event.clientY },
                    });

                    return gesture === null ? [] : [{ event, claimed: gesture }];
                }),
                // Otherwise ctrl+wheel zooms the whole browser page as well.
                tap(({ event }) => {
                    event.preventDefault();
                }),
                map(({ claimed }) => claimed),
            ),
        );

        this.edits$ = fromDocumentEvent$('keydown').pipe(
            mergeMap(event => {
                // composedPath, not target: a textarea inside a shadow root is retargeted to its host.
                const edit = keyEdit(
                    event.key,
                    event.ctrlKey || event.metaKey,
                    event.shiftKey,
                    isEditable(event.composedPath()[0] ?? null),
                );

                return edit === null ? [] : [{ event, claimed: edit }];
            }),
            tap(({ event }) => {
                event.preventDefault();
            }),
            map(({ claimed }) => claimed),
        );

        this.steps$ = fromDocumentEvent$('keydown').pipe(
            mergeMap(event => {
                // defaultPrevented: a control that used the arrow itself, like a todo grip, keeps it.
                const step = keyStep(
                    event.key,
                    event.ctrlKey || event.metaKey || event.altKey,
                    event.defaultPrevented || isEditable(event.composedPath()[0] ?? null),
                );

                return step === null ? [] : [{ event, claimed: step }];
            }),
            tap(({ event }) => {
                event.preventDefault();
            }),
            map(({ claimed }) => claimed),
        );

        this.keys$ = fromDocumentEvent$('keydown').pipe(
            mergeMap(event => {
                const zoom = keyZoom(event.key, event.ctrlKey || event.metaKey);

                return zoom === null ? [] : [{ event, claimed: zoom }];
            }),
            tap(({ event }) => {
                event.preventDefault();
            }),
            map(({ claimed }) => claimed),
        );
    }

    connect$(
        camera$: Observable<Camera>,
        variables$: Observable<ReadonlyMap<string, string>>,
        stateMode$: Observable<boolean>,
    ): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            merge(
                stateMode$.pipe(
                    distinctUntilChanged(),
                    tap(active => {
                        this.toggleAttribute('data-state-mode', active);
                    }),
                ),
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
            ).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-canvas', HksCanvas);
