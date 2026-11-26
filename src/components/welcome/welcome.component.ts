import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { renderView, type RenderView } from '../../lib/lit.ts';
import { styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { Footprint } from '../../shared/ui/icon.component.ts';
import { hidden, type WelcomeView } from './welcome.ts';
import css from './welcome.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = ({ shown, cards }: WelcomeView) =>
    html`<section class="welcome" aria-label="Starters" ?hidden=${!shown}>
        <p class="lead">
            Start from one of these, placed and playing in two clicks, or open any program from the
            launcher below.
        </p>
        <ul class="cards">
            ${repeat(
                cards,
                ({ id }) => id,
                card =>
                    html`<li>
                        <button type="button" class="card" data-starter=${card.id}>
                            ${Footprint(card)}
                            <span class="name">${card.name}</span>
                            <span class="summary" title=${card.summary}>${card.summary}</span>
                        </button>
                    </li>`,
            )}
        </ul>
    </section>`;

const keyOf = ({ shown, cards }: WelcomeView): string =>
    `${shown ? 1 : 0}:${cards.map(({ id, name }) => `${id}=${name}`).join(',')}`;

export class HksWelcome extends HTMLElement {
    readonly picks$: Observable<string>;

    private readonly rendering: RenderView<WelcomeView>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<WelcomeView>(shadow, hidden, TEMPLATE);
        this.picks$ = fromElementEvent$(this, 'click').pipe(
            mergeMap(event => {
                const target = event.composedPath()[0];
                const card = target instanceof Element ? target.closest('[data-starter]') : null;
                const id = card instanceof HTMLElement ? card.dataset['starter'] : undefined;

                return id === undefined ? [] : [id];
            }),
        );
    }

    connect$(view$: Observable<WelcomeView>): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            view$.pipe(
                distinctUntilChanged((a, b) => keyOf(a) === keyOf(b)),
                tap(view => this.rendering.update(view)),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-welcome', HksWelcome);
