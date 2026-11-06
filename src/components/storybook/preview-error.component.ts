import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { type Observable } from 'rxjs';
import { styleSheet } from '../../lib/dom.ts';
import { mountView } from '../../lib/lit.ts';
import css from './preview-error.css?inline';

const sheet = styleSheet(css);
export class HksPreviewError extends HTMLElement {
    readonly lifetime$: Observable<never>;
    constructor(message: string) {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.adoptedStyleSheets = [controlsSheet, sheet];
        this.lifetime$ = mountView(
            root,
            () =>
                html`<h2>This preview could not start</h2>
                    <p>${message}</p>
                    <p>Choose another example or reset to try again.</p>`,
        ).lifetime$;
    }
}
customElements.define('hks-preview-error', HksPreviewError);
