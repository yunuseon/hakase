import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { merge, type Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { styleSheet } from '../../lib/dom.ts';
import { renderView, type RenderView } from '../../lib/lit.ts';
import css from './design-foundations.css?inline';

const sheet = styleSheet(css);
export type FoundationView = {
    readonly kind: string;
    readonly label: string;
    readonly tokens: readonly string[];
    readonly icons: readonly { readonly name: string; readonly path: string }[];
};
const template = (view: FoundationView) =>
    html` <section ?hidden=${view.kind !== 'colours'}>
            <h2>Semantic colour</h2>
            <p>Colour describes a role. Every component inherits the same tokens.</p>
            <div class="swatches">
                ${repeat(
                    view.tokens,
                    token => token,
                    token =>
                        html`<div class="swatch">
                            <i style=${styleMap({ background: `var(--${token})` })}></i
                            ><code>--${token}</code>
                        </div>`,
                )}
            </div>
        </section>
        <section ?hidden=${view.kind !== 'type'}>
            <h2>Typography</h2>
            <p class="display">${view.label}</p>
            <p class="heading">A quiet place to make things</p>
            <p class="body">
                Geist for the interface. Clear hierarchy, restrained weight, and enough room to
                read.
            </p>
            <p class="caption">Labels and supporting information</p>
            <code class="mono">const view$ = state$.pipe(map(render));</code>
        </section>
        <section ?hidden=${view.kind !== 'space'}>
            <h2>Space & shape</h2>
            <p>Compact controls, soft corners and fine borders.</p>
            <div class="spaces">
                ${[4, 8, 12, 16, 24, 32].map(size => html`<div><i style=${styleMap({ 'inline-size': `${size}px` })}></i><code>${size}px</code></div>`)}
            </div>
            <div class="shapes">
                ${[4, 8, 12].map(radius => html`<div style=${styleMap({ 'border-radius': `${radius}px` })}>${radius}px</div>`)}
            </div>
        </section>
        <section ?hidden=${view.kind !== 'icons'}>
            <h2>Program icons</h2>
            <p>Single strokes, quiet until they are needed.</p>
            <div class="icons">
                ${repeat(
                    view.icons,
                    icon => icon.name,
                    icon =>
                        html`<div>
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d=${icon.path}></path></svg
                            ><span>${icon.name}</span>
                        </div>`,
                )}
            </div>
        </section>`;
export class HksDesignFoundations extends HTMLElement {
    private readonly rendering: RenderView<FoundationView>;
    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<FoundationView>(
            root,
            { kind: 'colours', label: 'Design foundations', tokens: [], icons: [] },
            template,
        );
    }
    connect$(view$: Observable<FoundationView>): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            view$.pipe(tap(view => this.rendering.update(view))),
        ).pipe(map(() => undefined));
    }
}
customElements.define('hks-design-foundations', HksDesignFoundations);
