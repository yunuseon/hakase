import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { withValue } from '../../lib/lit.ts';
import { ifDefined } from 'lit-html/directives/if-defined.js';

import { renderView, type RenderView } from '../../lib/lit.ts';
import { combineLatest, EMPTY, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { sameTaskRows, type TaskRow } from './task-manager.ts';
import css from './task-manager.css?inline';

const sheet = styleSheet(css);
type TaskRender = { readonly rows: readonly TaskRow[]; readonly closable: number };

const TEMPLATE = (view: TaskRender) =>
    html`<div class="rows" role="list" aria-label="open windows">
            ${repeat(
                view.rows.map(row => row.id),
                item => item,
                id =>
                    withValue(
                        view.rows.find(row => row.id === id),
                        row =>
                            html`<div
                                class="row"
                                role="listitem"
                                data-focused=${ifDefined(row.focused ? '' : undefined)}
                            >
                                <button
                                    type="button"
                                    class="jump"
                                    data-reveal=${ifDefined(id)}
                                    title=${ifDefined(`go to ${row.label}`)}
                                    aria-label=${ifDefined(`go to ${row.label}`)}
                                >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d=${ifDefined(row.icon)}></path></svg
                                    ><span class="name">${row.label}</span
                                    ><svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d=${ifDefined(JUMP)}></path>
                                    </svg></button
                                ><button
                                    type="button"
                                    class="close"
                                    data-close=${ifDefined(id)}
                                    title=${ifDefined(`close ${row.label}`)}
                                    aria-label=${ifDefined(`close ${row.label}`)}
                                >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d=${ifDefined(CLOSE)}></path>
                                    </svg>
                                </button>
                            </div>`,
                    ),
            )}
        </div>
        <p class="empty" ?hidden=${view.rows.length > 0}>Nothing is open.</p>
        <footer class="foot">
            <span class="count">${view.closable} other window${view.closable === 1 ? '' : 's'}</span
            ><button class="close-all" ?disabled=${view.closable === 0} type="button">
                Close all
            </button>
        </footer>`;

const JUMP =
    'M12 4 V8 M12 16 V20 M4 12 H8 M16 12 H20 M12 12 m -4 0 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0';
const CLOSE = 'M7 7 L17 17 M17 7 L7 17';

const clicked$ = (element: HTMLElement, key: string): Observable<string> =>
    fromElementEvent$(element, 'click').pipe(
        mergeMap(event => {
            const target =
                event.target instanceof Element ? event.target.closest(`[data-${key}]`) : null;
            const value = target instanceof HTMLElement ? target.dataset[key] : undefined;

            return value === undefined ? EMPTY : of(value);
        }),
    );

export class HksTaskManager extends HTMLElement {
    readonly reveals$: Observable<string>;
    readonly closes$: Observable<string>;
    readonly closeAlls$: Observable<void>;

    private readonly rows: HTMLElement;
    private readonly closeAll: HTMLButtonElement;

    private readonly rendering: RenderView<TaskRender>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        this.rendering = renderView<TaskRender>(shadow, { rows: [], closable: 0 }, TEMPLATE);

        this.rows = requireChild(shadow, '.rows');
        this.reveals$ = clicked$(this.rows, 'reveal');
        this.closeAll = requireElement(shadow, '.close-all', HTMLButtonElement);
        this.closes$ = clicked$(this.rows, 'close');
        this.closeAlls$ = fromElementEvent$(this.closeAll, 'click').pipe(map(() => undefined));
    }

    // closable, not rows.length: only the program knows which row is the manager itself.
    connect$(
        rows$: Observable<readonly TaskRow[]>,
        closable$: Observable<number>,
    ): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            combineLatest([
                rows$.pipe(distinctUntilChanged(sameTaskRows)),
                closable$.pipe(distinctUntilChanged()),
            ]).pipe(
                tap(([rows, closable]) => this.rendering.update({ rows, closable })),
                map(() => undefined),
            ),
        );
    }
}

customElements.define('hks-task-manager', HksTaskManager);
