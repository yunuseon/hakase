import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { styleMap } from 'lit-html/directives/style-map.js';
import { repeat } from 'lit-html/directives/repeat.js';

import { renderView, type RenderView } from '../../lib/lit.ts';
import { merge, type Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import type { GhostView, PlacementEvent } from './placement.ts';
import css from './placement.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = (view: GhostView | null) =>
    html`<div
            class="ghost"
            style=${styleMap({
                transform: `translate(${view?.section.x ?? 0}px, ${view?.section.y ?? 0}px)`,
                width: `${view?.section.width ?? 0}px`,
                height: `${view?.section.height ?? 0}px`,
            })}
        >
            <span class="label">${view?.name}</span>${repeat(
                view?.windows ?? [],
                (_item, index) => index,
                box =>
                    html`<span
                        class="window"
                        style=${styleMap({
                            transform: `translate(${box.x - (view?.section.x ?? 0)}px, ${box.y - (view?.section.y ?? 0)}px)`,
                            width: `${box.width}px`,
                            height: `${box.height}px`,
                        })}
                    ></span>`,
            )}
        </div>
        <p class="ui-hint hint">
            Click to place <b class="what">${view?.name}</b
            ><span class="keys">Esc to cancel · scroll to move around</span>
        </p>`;

export class HksPlacement extends HTMLElement {
    readonly changes$: Observable<PlacementEvent>;

    private readonly rendering: RenderView<GhostView | null>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<GhostView | null>(shadow, null, TEMPLATE);
        this.hidden = true;
        // Read by the canvas: a wheel over the ghost still pans and zooms, as it would over the ground.
        this.dataset['ground'] = '';

        this.changes$ = merge(
            fromElementEvent$(this, 'pointermove').pipe(
                map((event): PlacementEvent => ({
                    kind: 'move',
                    at: { x: event.clientX, y: event.clientY },
                })),
            ),
            fromElementEvent$(this, 'click').pipe(
                mergeMap((event): PlacementEvent[] =>
                    event.button === 0
                        ? [{ kind: 'drop', at: { x: event.clientX, y: event.clientY } }]
                        : [],
                ),
            ),
            fromElementEvent$(this, 'contextmenu').pipe(
                tap(event => {
                    event.preventDefault();
                }),
                map((): PlacementEvent => ({ kind: 'cancel' })),
            ),
            fromDocumentEvent$('keydown').pipe(
                mergeMap((event): PlacementEvent[] =>
                    event.key === 'Escape' && !this.hidden ? [{ kind: 'cancel' }] : [],
                ),
            ),
        );
    }

    connect$(ghost$: Observable<GhostView | null>): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            ghost$.pipe(
                tap(view => {
                    this.hidden = view === null;
                    this.rendering.update(view);
                }),
                map(() => undefined),
            ),
        );
    }
}

customElements.define('hks-placement', HksPlacement);
