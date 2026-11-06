import { html, svg } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { ref } from 'lit-html/directives/ref.js';
import { merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { renderView, displayValue } from '../../lib/lit.ts';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { areaFill, areaOutline, boundsOf } from '../../shared/area.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { sameSections, type SectionGesture, type SectionView } from './sections.ts';
import css from './sections.css?inline';
const sheet = styleSheet(css);

export class HksSections extends HTMLElement {
    readonly gestures$: Observable<SectionGesture>;
    private readonly rendering;
    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<readonly SectionView[]>(
            root,
            [],
            sections =>
                html` <div class="layer">
                    <svg class="areas" aria-hidden="true">
                        ${repeat(
                            sections,
                            s => s.id,
                            s => svg`
                <path class="fill" d=${areaFill(s.rects)}></path>
                <path class="edge" d=${areaOutline(s.rects)}></path>`,
                        )}
                    </svg>
                    ${repeat(
                        sections,
                        s => s.id,
                        s => {
                            const anchor = s.rects[0] ?? boundsOf(s.rects);
                            return html`<div
                                class="label"
                                style=${styleMap({ left: `${anchor.x + 8}px`, top: `${anchor.y + 6}px` })}
                            >
                                <input
                                    class="ui-field name"
                                    readonly
                                    spellcheck="false"
                                    data-id=${s.id}
                                    aria-label="section name, double-click to rename"
                                    ${ref(el => {
                                        if (el instanceof HTMLInputElement)
                                            displayValue(el, s.name);
                                    })}
                                />
                                <button
                                    class="ui-icon remove"
                                    data-remove=${s.id}
                                    aria-label="delete section"
                                    title="Delete area, keep programs"
                                >
                                    ×
                                </button>
                            </div>`;
                        },
                    )}
                </div>`,
        );
        this.gestures$ = merge(
            fromElementEvent$(this, 'click').pipe(
                mergeMap(event => {
                    const target = event.composedPath()[0];
                    const id = target instanceof HTMLElement ? target.dataset['remove'] : undefined;
                    return id === undefined ? [] : [{ kind: 'remove' as const, id }];
                }),
            ),
            fromElementEvent$(requireChild(root, '.layer'), 'change').pipe(
                mergeMap(event => {
                    const target = event.target;
                    const id =
                        target instanceof HTMLInputElement ? target.dataset['id'] : undefined;
                    return id === undefined || !(target instanceof HTMLInputElement)
                        ? []
                        : [{ kind: 'rename' as const, id, name: target.value }];
                }),
            ),
        );
    }
    connect$(sections$: Observable<readonly SectionView[]>): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            sections$.pipe(
                distinctUntilChanged(sameSections),
                tap(sections => this.rendering.update(sections)),
            ),
            fromElementEvent$(this, 'dblclick').pipe(
                tap(event => {
                    const target = event.composedPath()[0];
                    if (target instanceof HTMLInputElement) {
                        target.readOnly = false;
                        target.select();
                    }
                }),
            ),
            fromElementEvent$(this, 'keydown').pipe(
                tap(event => {
                    const target = event.composedPath()[0];
                    if (target instanceof HTMLInputElement && event.key === 'Enter') target.blur();
                }),
            ),
            fromElementEvent$(this, 'focusout').pipe(
                tap(event => {
                    const target = event.composedPath()[0];
                    if (target instanceof HTMLInputElement) target.readOnly = true;
                }),
            ),
        ).pipe(map(() => undefined));
    }
}
customElements.define('hks-sections', HksSections);
