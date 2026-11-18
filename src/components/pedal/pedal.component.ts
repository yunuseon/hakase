import { html } from 'lit-html';
import { merge, type Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { renderView, type RenderView } from '../../lib/lit.ts';
import { styleSheet } from '../../lib/dom.ts';
import { controlsSheet, whys$ } from '../../shared/ui/controls.component.ts';
import type { PedalView } from './pedal.ts';
import css from './pedal.css?inline';

const sheet = styleSheet(css);

const empty: PedalView = { summary: '', knobs: [], choices: [], choice: '', inputs: [] };

const TEMPLATE = (view: PedalView) =>
    html`<p class="summary">${view.summary}</p>
        <ul class="inputs">
            ${view.inputs.map(
                input =>
                    html`<li class="input">
                        ${input.name} · <b>${input.from ?? 'unplugged'}</b>
                    </li>`,
            )}
        </ul>
        <slot></slot>`;

export class HksPedal extends HTMLElement {
    readonly whys$: Observable<string> = whys$(this);

    private readonly rendering: RenderView<PedalView>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        const root = document.createElement('div');
        root.className = 'pedal';
        shadow.append(root);
        this.rendering = renderView(root, empty, TEMPLATE);
    }

    connect$(view$: Observable<PedalView>): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            view$.pipe(
                tap(view => {
                    this.rendering.update(view);
                }),
                map(() => undefined),
            ),
        );
    }
}

customElements.define('hks-pedal', HksPedal);
