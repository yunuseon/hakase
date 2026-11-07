import { html } from 'lit-html';
import { merge, type Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { renderView } from '../../lib/lit.ts';
import { styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { SELECTION_COMMANDS, type SelectionCommand, type SelectionView } from './selection.ts';
import css from './selection.css?inline';
const sheet = styleSheet(css);
export class HksSelection extends HTMLElement {
    readonly changes$: Observable<SelectionCommand>;
    private readonly rendering;
    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView<SelectionView>(
            root,
            { count: 0, copied: false },
            view =>
                html`<div
                    class="actions"
                    role="toolbar"
                    aria-label="Selected programs"
                    ?hidden=${view.count === 0}
                >
                    <span role="status">${view.count} selected</span>
                    <button
                        class="ui-button"
                        data-command="copy"
                        ?disabled=${view.count === 0}
                        title="Copy programs (⌘C)"
                    >
                        Copy
                    </button>
                    <button
                        class="ui-button"
                        data-command="paste"
                        ?disabled=${!view.copied}
                        title="Place a copy (⌘V)"
                    >
                        Paste
                    </button>
                    <button class="ui-button" data-command="save" ?disabled=${view.count === 0}>
                        Save as blueprint
                    </button>
                    <button
                        class="ui-icon"
                        data-command="clear"
                        aria-label="clear selection"
                        title="Clear selection"
                    >
                        ×
                    </button>
                </div>`,
        );
        this.changes$ = fromElementEvent$(this, 'click').pipe(
            mergeMap(event => {
                const target = event.composedPath()[0];
                const command =
                    target instanceof HTMLElement
                        ? target.closest('[data-command]')?.getAttribute('data-command')
                        : null;
                return SELECTION_COMMANDS.filter(c => c === command);
            }),
        );
    }
    connect$(view$: Observable<SelectionView>): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            view$.pipe(tap(view => this.rendering.update(view))),
        ).pipe(map(() => undefined));
    }
}
customElements.define('hks-selection', HksSelection);
