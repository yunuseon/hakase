import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { mountView, type Rendering } from '../../lib/lit.ts';
import { merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../lib/dom.ts';
import type { BarView } from './progress-bar.ts';
import css from './progress-bar.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = () =>
    html`<div class="head"><span class="title"></span><span class="detail"></span></div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100">
            <div class="fill"></div>
        </div>
        <div class="span"><span class="start"></span><span class="end"></span></div>`;

export class HksProgressBar extends HTMLElement {
    private readonly bar: HTMLElement;

    private readonly rendering: Rendering;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());

        this.bar = requireChild(shadow, '.bar');
    }

    connect$(view$: Observable<BarView>): Observable<void> {
        const shadow = this.shadowRoot ?? this;
        const text$ = (selector: string, read: (view: BarView) => string) => {
            const element = requireChild(shadow, selector);

            return view$.pipe(
                map(read),
                distinctUntilChanged(),
                tap(text => {
                    element.textContent = text;
                }),
            );
        };

        return merge(
            this.rendering.lifetime$,
            merge(
                text$('.title', ({ title }) => title),
                text$('.detail', ({ detail }) => detail),
                text$('.start', ({ start }) => start),
                text$('.end', ({ end }) => end),
                view$.pipe(
                    map(({ state }) => state),
                    distinctUntilChanged(),
                    tap(state => {
                        this.dataset['state'] = state;
                    }),
                ),
                view$.pipe(
                    map(({ title, fill }) => ({ title, percent: (fill * 100).toFixed(2) })),
                    distinctUntilChanged((a, b) => a.title === b.title && a.percent === b.percent),
                    tap(({ title, percent }) => {
                        this.bar.style.setProperty('--fill', `${percent}%`);
                        this.bar.setAttribute('aria-valuenow', String(Math.round(Number(percent))));
                        this.bar.setAttribute('aria-label', title);
                    }),
                ),
            ).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-progress-bar', HksProgressBar);
