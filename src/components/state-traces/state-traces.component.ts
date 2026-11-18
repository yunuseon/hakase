import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { svg } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { classMap } from 'lit-html/directives/class-map.js';
import { merge, type Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { styleSheet } from '../../lib/dom.ts';
import { renderView, type RenderView } from '../../lib/lit.ts';
import type { WiringView } from '../state-wiring/wiring.ts';
import css from './state-traces.css?inline';

const sheet = styleSheet(css);

type Traces = WiringView['wires'];

export class HksStateTraces extends HTMLElement {
    private readonly rendering: RenderView<Traces>;

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<Traces>(
            shadow,
            [],
            traces =>
                svg`<svg aria-hidden="true">${repeat(
                    traces,
                    trace => trace,
                    trace =>
                        svg`<path d=${ifDefined(trace.path)} data-from=${ifDefined(trace.from)} data-to=${ifDefined(trace.to)} style=${styleMap({ '--store': trace.colour })} class=${classMap({ shared: trace.shared })}></path>`,
                )}</svg>`,
        );
    }

    connect$(
        view$: Observable<WiringView | null>,
        lit$: Observable<string | null>,
    ): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            view$.pipe(
                tap(view => {
                    this.hidden = view === null;
                    this.rendering.update(view?.wires ?? []);
                }),
            ),
            lit$.pipe(
                tap(key => {
                    for (const path of this.shadowRoot?.querySelectorAll('path') ?? []) {
                        path.toggleAttribute(
                            'data-lit',
                            key !== null &&
                                (path.getAttribute('data-from') === key ||
                                    path.getAttribute('data-to') === key),
                        );
                    }
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-state-traces', HksStateTraces);
