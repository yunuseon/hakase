import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { type Observable } from 'rxjs';
import { styleSheet } from '../../lib/dom.ts';
import { mountView } from '../../lib/lit.ts';
import type { Failure } from './failure.ts';
import css from './failure.css?inline';

const sheet = styleSheet(css);

export class HksFailure extends HTMLElement {
    readonly lifetime$: Observable<never>;

    constructor({ title, message, advice }: Failure) {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.adoptedStyleSheets = [controlsSheet, sheet];
        this.lifetime$ = mountView(
            root,
            () =>
                html`<h2>${title}</h2>
                    <p class="message">${message}</p>
                    <p>${advice}</p>`,
        ).lifetime$;
    }
}

customElements.define('hks-failure', HksFailure);
