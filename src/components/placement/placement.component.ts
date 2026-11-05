import { merge, type Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import type { Box, GhostView, PlacementEvent } from './placement.ts';
import css from './placement.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <div class="ghost"><span class="label"></span></div>
    <p class="hint">Click to place <b class="what"></b><span class="keys">Esc to cancel · scroll to move around</span></p>
`;

const placedAt = (element: HTMLElement, { x, y, width, height }: Box) => {
    element.style.transform = `translate(${x}px, ${y}px)`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
};

export class HksPlacement extends HTMLElement {
    readonly changes$: Observable<PlacementEvent>;

    private readonly shadow: ShadowRoot;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;
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
        const ghost = requireChild(this.shadow, '.ghost');
        const label = requireChild(this.shadow, '.label');
        const what = requireChild(this.shadow, '.what');

        return ghost$.pipe(
            tap(view => {
                this.hidden = view === null;

                if (view === null) {
                    return;
                }

                placedAt(ghost, view.section);
                label.textContent = view.name;
                what.textContent = view.name;

                const rooms = [...ghost.querySelectorAll('.window')];

                view.windows.forEach((box, index) => {
                    const room =
                        rooms[index] ??
                        ghost.appendChild(
                            Object.assign(document.createElement('span'), { className: 'window' }),
                        );

                    if (room instanceof HTMLElement) {
                        placedAt(room, {
                            ...box,
                            x: box.x - view.section.x,
                            y: box.y - view.section.y,
                        });
                    }
                });
                rooms.slice(view.windows.length).forEach(room => {
                    room.remove();
                });
            }),
            map(() => undefined),
        );
    }
}

customElements.define('hks-placement', HksPlacement);
