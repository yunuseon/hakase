import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { withValue } from '../../lib/lit.ts';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { ref } from 'lit-html/directives/ref.js';

import { renderView, displayValue, type RenderView } from '../../lib/lit.ts';
import { EMPTY, merge, of, type Observable } from 'rxjs';
import {
    distinctUntilChanged,
    filter,
    map,
    mergeMap,
    pairwise,
    startWith,
    switchMap,
    takeUntil,
    tap,
} from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromDocumentEvent$, fromElementEvent$ } from '../../lib/rx.ts';
import { sameSections, type SectionGesture, type SectionView } from './sections.ts';
import css from './sections.css?inline';

const sheet = styleSheet(css);

const dataOf = (target: EventTarget | null, key: string): string | undefined => {
    const element = target instanceof Element ? target.closest(`[data-${key}]`) : null;

    return element instanceof HTMLElement ? element.dataset[key] : undefined;
};

export class HksSections extends HTMLElement {
    readonly gestures$: Observable<SectionGesture>;

    private readonly layer: HTMLElement;
    private readonly rendering: RenderView<readonly SectionView[]>;

    constructor() {
        super();

        const root = this.attachShadow({ mode: 'open' });
        root.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<readonly SectionView[]>(
            root,
            [],
            sections =>
                html`<div class="layer">
                    ${repeat(
                        sections.map(section => section.id),
                        item => item,
                        id =>
                            withValue(
                                sections.find(section => section.id === id),
                                section =>
                                    html`<fieldset
                                        class="section"
                                        data-section=${ifDefined(id)}
                                        style=${styleMap({
                                            left: `${section.x}px`,
                                            top: `${section.y}px`,
                                            width: `${section.width}px`,
                                            height: `${section.height}px`,
                                        })}
                                    >
                                        <legend class="label" data-move=${ifDefined(id)}>
                                            <input
                                                class="ui-field name"
                                                readonly
                                                spellcheck=${ifDefined(false)}
                                                data-rename=${ifDefined(id)}
                                                aria-label="section name, double-click to rename"
                                                ${ref(element => {
                                                    if (element instanceof HTMLInputElement) {
                                                        displayValue(element, section.name);
                                                    }
                                                })}
                                            /><span class="actions"
                                                ><button
                                                    class="save"
                                                    type="button"
                                                    data-save=${ifDefined(id)}
                                                    title="Keep everything in this section as a blueprint you can place again"
                                                >
                                                    Save as blueprint</button
                                                ><button
                                                    class="remove"
                                                    type="button"
                                                    data-remove=${ifDefined(id)}
                                                    aria-label="delete section"
                                                >
                                                    ×
                                                </button></span
                                            >
                                        </legend>
                                        <div class="corner" data-resize=${ifDefined(id)}></div>
                                    </fieldset>`,
                            ),
                    )}
                </div>`,
        );

        this.layer = requireChild(root, '.layer');
        const drags$ = (kind: 'move' | 'resize'): Observable<SectionGesture> =>
            fromElementEvent$(this, 'pointerdown').pipe(
                mergeMap(start => {
                    const target = start.composedPath()[0] ?? null;
                    const id = dataOf(target, kind);
                    // A name being edited takes its own pointer, to place the caret.
                    const editing = target instanceof HTMLInputElement && !target.readOnly;

                    return id === undefined || editing || !start.isPrimary || start.button !== 0
                        ? EMPTY
                        : of({ start, id });
                }),
                tap(({ start }) => {
                    start.preventDefault();
                }),
                switchMap(({ start, id }) => {
                    const same = (event: PointerEvent): boolean =>
                        event.pointerId === start.pointerId;

                    // Ends on the document: released anywhere, the drag must still finish.
                    const end$ = merge(
                        fromDocumentEvent$('pointerup'),
                        fromDocumentEvent$('pointercancel'),
                    ).pipe(filter(same));

                    return fromDocumentEvent$('pointermove').pipe(
                        filter(same),
                        takeUntil(end$),
                        startWith(start),
                        pairwise(),
                        map(([from, to]): SectionGesture => ({
                            kind,
                            id,
                            dx: to.clientX - from.clientX,
                            dy: to.clientY - from.clientY,
                        })),
                    );
                }),
            );

        const pathTarget = (event: Event): EventTarget | null => event.composedPath()[0] ?? null;

        this.gestures$ = merge(
            drags$('move'),
            drags$('resize'),
            fromElementEvent$(this, 'click').pipe(
                mergeMap((event): Observable<SectionGesture> => {
                    const target = pathTarget(event);
                    const removed = dataOf(target, 'remove');
                    const saved = dataOf(target, 'save');

                    return removed !== undefined
                        ? of({ kind: 'remove', id: removed })
                        : saved !== undefined
                          ? of({ kind: 'save', id: saved })
                          : EMPTY;
                }),
            ),
            // On the layer, not the host: change is not composed, so it never leaves the shadow root.
            fromElementEvent$(this.layer, 'change').pipe(
                mergeMap((event): Observable<SectionGesture> => {
                    const target = pathTarget(event);
                    const id = dataOf(target, 'rename');

                    return id === undefined || !(target instanceof HTMLInputElement)
                        ? EMPTY
                        : of({ kind: 'rename', id, name: target.value });
                }),
            ),
        );
    }

    connect$(sections$: Observable<readonly SectionView[]>): Observable<void> {
        const editing$ = merge(
            fromElementEvent$(this, 'dblclick').pipe(
                map(event => event.composedPath()[0] ?? null),
                tap(target => {
                    if (
                        target instanceof HTMLInputElement &&
                        dataOf(target, 'rename') !== undefined
                    ) {
                        target.readOnly = false;
                        target.select();
                    }
                }),
            ),
            fromElementEvent$(this, 'keydown').pipe(
                tap(event => {
                    const target = event.composedPath()[0] ?? null;

                    if (target instanceof HTMLInputElement && event.key === 'Enter') {
                        target.blur();
                    }
                }),
            ),
            fromElementEvent$(this, 'focusout').pipe(
                tap(event => {
                    const target = event.composedPath()[0] ?? null;

                    if (target instanceof HTMLInputElement) {
                        target.readOnly = true;
                    }
                }),
            ),
        );

        const drawn$ = sections$.pipe(
            distinctUntilChanged(sameSections),
            tap(sections => this.rendering.update(sections)),
        );

        return merge(this.rendering.lifetime$, drawn$, editing$).pipe(map(() => undefined));
    }
}

customElements.define('hks-sections', HksSections);
