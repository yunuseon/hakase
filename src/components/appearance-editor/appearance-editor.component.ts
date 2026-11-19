import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { renderView, type RenderView } from '../../lib/lit.ts';
import type { Observable } from 'rxjs';
import { styleSheet } from '../../lib/dom.ts';
import css from './appearance-editor.css?inline';

const sheet = styleSheet(css);
const none: readonly string[] = [];

const TEMPLATE = (tokens: readonly string[]) =>
    html`<div class="swatches">
            ${repeat(
                tokens,
                item => item,
                token =>
                    html`<span
                        class="swatch"
                        style=${styleMap({ background: `var(--${token})` })}
                        title=${ifDefined(token)}
                    ></span>`,
            )}
        </div>
        <slot></slot>`;

export class HksAppearanceEditor extends HTMLElement {
    private readonly rendering: RenderView<readonly string[]>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView(shadow, none, TEMPLATE);
    }

    tokens(tokens: readonly string[]): this {
        this.rendering.update(tokens);

        return this;
    }

    connect$(): Observable<never> {
        return this.rendering.lifetime$;
    }
}

customElements.define('hks-appearance-editor', HksAppearanceEditor);
