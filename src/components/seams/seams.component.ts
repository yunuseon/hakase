import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { styleMap } from 'lit-html/directives/style-map.js';

import { renderView, type RenderView } from '../../lib/lit.ts';
import { merge } from 'rxjs';
import { EMPTY, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { sameSeams, type SeamToggle, type SeamView } from './seams.ts';
import css from './seams.css?inline';

const sheet = styleSheet(css);

export class HksSeams extends HTMLElement {
    readonly toggles$: Observable<SeamToggle>;

    private readonly rendering: RenderView<readonly SeamView[]>;

    constructor() {
        super();

        const root = this.attachShadow({ mode: 'open' });
        root.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<readonly SeamView[]>(root, [], seams =>
            repeat(
                seams,
                item => item,
                seam =>
                    html`<button
                        type="button"
                        class="seam"
                        data-a=${ifDefined(seam.a)}
                        data-b=${ifDefined(seam.b)}
                        data-linked=${ifDefined(seam.linked ? '' : undefined)}
                        data-vertical=${ifDefined(seam.vertical ? '' : undefined)}
                        style=${styleMap({ transform: `translate(${seam.x}px, ${seam.y}px)` })}
                        title=${ifDefined(seam.linked ? 'detach windows' : 'attach windows')}
                        aria-label=${ifDefined(seam.linked ? 'detach windows' : 'attach windows')}
                        aria-pressed=${ifDefined(seam.linked)}
                    ></button>`,
            ),
        );

        this.toggles$ = fromElementEvent$(this, 'click').pipe(
            mergeMap(event => {
                const seam = event
                    .composedPath()
                    .find(
                        target =>
                            target instanceof HTMLElement && target.classList.contains('seam'),
                    );

                if (!(seam instanceof HTMLElement)) {
                    return EMPTY;
                }

                const { a, b } = seam.dataset;

                return a === undefined || b === undefined ? EMPTY : of({ a, b });
            }),
        );
    }

    connect$(seams$: Observable<readonly SeamView[]>): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            seams$.pipe(
                distinctUntilChanged(sameSeams),
                tap(seams => {
                    this.rendering.update(seams);
                }),
                map(() => undefined),
            ),
        );
    }
}

customElements.define('hks-seams', HksSeams);
