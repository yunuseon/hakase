import { html, svg } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { merge, type Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { renderView, type RenderView } from '../../lib/lit.ts';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import css from './streams.css?inline';

const sheet = styleSheet(css);

export type StreamLane = {
    readonly name: string;
    readonly rate: string;
    readonly last: string;
    readonly ago: string;
    readonly total: number;
    readonly dots: readonly number[];
    readonly doubled: number;
};

export type StreamTurn = { readonly key: string; readonly ago: string; readonly fired: string };

export type StreamsView = {
    readonly lanes: readonly StreamLane[];
    readonly turns: readonly StreamTurn[];
    readonly summary: string;
    readonly warning: string | null;
};

export const emptyStreams: StreamsView = { lanes: [], turns: [], summary: '', warning: null };

const lane = (dots: readonly number[]) =>
    svg`<svg class="lane" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="5" x2="100" y2="5"></line>
        ${dots.map(x => svg`<rect x=${(x * 99).toFixed(2)} y="1" width="1" height="8"></rect>`)}
    </svg>`;

const TEMPLATE = ({ lanes, turns, summary, warning }: StreamsView) =>
    html`<header class="head" data-detail>
            <span class="summary">${summary}</span>
            <button
                type="button"
                class="ui-button copy"
                title="Copy the report as JSON, for an agent"
            >
                Copy for an agent
            </button>
        </header>
        ${warning === null ? '' : html`<p class="warning" role="status">${warning}</p>`}
        <ol class="lanes" aria-label="streams">
            ${repeat(
                lanes,
                ({ name }) => name,
                ({ name, rate, last, ago, total, dots, doubled }) =>
                    html`<li data-doubled=${doubled > 0 ? 'true' : 'false'}>
                        <span class="name" title=${`${total} in all`}>${name}</span>
                        ${lane(dots)}
                        <span class="rate">${rate}</span>
                        <span class="last" title=${last} data-detail>${last}</span>
                        <span class="ago" data-detail>${ago}</span>
                    </li>`,
            )}
        </ol>
        <ol class="turns" aria-label="last turns" data-detail>
            ${repeat(
                turns,
                ({ key }) => key,
                ({ ago, fired }) =>
                    html`<li>
                        <span class="ago">${ago}</span><span class="fired">${fired}</span>
                    </li>`,
            )}
        </ol>`;

export class HksStreams extends HTMLElement {
    readonly copies$: Observable<void>;

    private readonly rendering: RenderView<StreamsView>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<StreamsView>(shadow, emptyStreams, TEMPLATE);
        this.copies$ = fromElementEvent$(requireChild(shadow, '.copy'), 'click').pipe(
            map(() => undefined),
        );
    }

    connect$(view$: Observable<StreamsView>): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            view$.pipe(tap(view => this.rendering.update(view))),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-streams', HksStreams);
