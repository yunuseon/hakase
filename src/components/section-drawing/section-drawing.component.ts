import { html } from 'lit-html';
import { styleMap } from 'lit-html/directives/style-map.js';
import { merge, type Observable } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { renderView } from '../../lib/lit.ts';
import { styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { pointerGesture$ } from '../../shared/drag.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import {
    type Drawing,
    type DrawingAction,
    rectangleBetween,
    drawingPoint,
} from './section-drawing.ts';
import css from './section-drawing.css?inline';

const sheet = styleSheet(css);

export class HksSectionDrawing extends HTMLElement {
    readonly changes$: Observable<DrawingAction>;
    private readonly rendering;

    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.adoptedStyleSheets = [controlsSheet, sheet];
        this.hidden = true;
        this.dataset['ground'] = '';
        this.rendering = renderView<Drawing>(root, { mode: 'idle' }, drawing => {
            const rect =
                drawing.mode === 'drawing' ? rectangleBetween(drawing.start, drawing.at) : null;
            return html`<div
                    class="outline"
                    data-tool=${drawing.mode === 'idle' ? 'paint' : drawing.tool}
                    ?hidden=${rect === null}
                    style=${styleMap({
                        left: `${rect?.x ?? 0}px`,
                        top: `${rect?.y ?? 0}px`,
                        width: `${rect?.width ?? 0}px`,
                        height: `${rect?.height ?? 0}px`,
                    })}
                ></div>
                <p class="ui-hint hint" role="status">
                    ${drawing.mode === 'idle' || drawing.tool === 'paint' ? 'Drag to paint a section' : drawing.tool === 'erase' ? 'Drag to erase section area' : 'Drag to select programs'}
                    <span>Esc to cancel</span>
                </p>`;
        });
        this.changes$ = merge(
            pointerGesture$(this, () => !this.hidden).pipe(
                map(({ phase, event }): DrawingAction =>
                    event.type === 'pointercancel'
                        ? { kind: 'cancel' }
                        : {
                              kind: phase,
                              at: drawingPoint(
                                  { x: event.clientX, y: event.clientY },
                                  this.getBoundingClientRect(),
                                  { width: this.offsetWidth, height: this.offsetHeight },
                              ),
                          },
                ),
            ),
            fromElementEvent$(this, 'contextmenu').pipe(
                tap(event => event.preventDefault()),
                map((): DrawingAction => ({ kind: 'cancel' })),
            ),
        );
    }

    connect$(drawing$: Observable<Drawing>): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            drawing$.pipe(
                tap(drawing => {
                    this.hidden = drawing.mode !== 'ready' && drawing.mode !== 'drawing';
                    this.rendering.update(drawing);
                }),
                switchMap(drawing =>
                    drawing.mode === 'drawing'
                        ? fromElementEvent$(this, 'wheel').pipe(
                              tap(event => event.preventDefault()),
                          )
                        : [],
                ),
            ),
        ).pipe(map(() => undefined));
    }
}
customElements.define('hks-section-drawing', HksSectionDrawing);
