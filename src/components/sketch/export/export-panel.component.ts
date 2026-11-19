import { controlsSheet } from '../../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { mountView, type Rendering } from '../../../lib/lit.ts';
import { combineLatest, merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, share, tap } from 'rxjs/operators';
import { requireChild, requireElement, saveFile, styleSheet } from '../../../lib/dom.ts';
import { fromElementEvent$ } from '../../../lib/rx.ts';
import {
    type Aspect,
    type ExportChange,
    type ExportSettings,
} from '../../../model/sketch/export.ts';
import { HksProperties } from '../../../shared/ui/properties.component.ts';
import { aspectOf, exportChangeOf, exportSections } from './export-sections.ts';
import css from './export-panel.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = () =>
    html`<div class="settings"></div>
        <div class="row actions">
            <span class="summary"></span><span class="status" role="status"></span
            ><button class="ui-button button cancel" type="button" hidden>Cancel</button
            ><button
                class="ui-button button still"
                type="button"
                title="save the frame under the playhead as a PNG"
            >
                Save frame</button
            ><button class="ui-button button primary start" type="button">Export</button>
        </div>`;

export type SavedFile = {
    readonly blob: Blob;
    readonly name: string;
};

export type ExportStatus =
    | { readonly kind: 'idle' }
    | { readonly kind: 'running'; readonly done: number }
    | { readonly kind: 'failed'; readonly message: string };

export class HksExportPanel extends HTMLElement {
    readonly changes$: Observable<ExportChange>;
    readonly aspects$: Observable<Aspect>;
    readonly starts$: Observable<void>;
    readonly cancels$: Observable<void>;
    readonly stills$: Observable<void>;

    private readonly start: HTMLButtonElement;
    private readonly cancel: HTMLButtonElement;
    private readonly summary: HTMLElement;
    private readonly status: HTMLElement;
    private readonly properties: HksProperties;

    private readonly rendering: Rendering;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());

        this.start = requireElement(shadow, '.start', HTMLButtonElement);
        this.cancel = requireElement(shadow, '.cancel', HTMLButtonElement);
        this.summary = requireChild(shadow, '.summary');
        this.status = requireChild(shadow, '.status');

        this.starts$ = fromElementEvent$(this.start, 'click').pipe(map(() => undefined));
        this.cancels$ = fromElementEvent$(this.cancel, 'click').pipe(map(() => undefined));
        this.stills$ = fromElementEvent$(
            requireElement(shadow, '.still', HTMLButtonElement),
            'click',
        ).pipe(map(() => undefined));

        this.properties = new HksProperties();
        requireChild(shadow, '.settings').append(this.properties);
        const changes$ = this.properties.changes$.pipe(share());
        this.changes$ = changes$.pipe(mergeMap(exportChangeOf));
        this.aspects$ = changes$.pipe(mergeMap(aspectOf));
    }

    connect$(
        settings$: Observable<ExportSettings>,
        summary$: Observable<string>,
        status$: Observable<ExportStatus>,
        files$: Observable<SavedFile>,
        aspect$: Observable<Aspect | null>,
    ): Observable<void> {
        // Only a chain's picture has the app's aspect; a sketch's window frames its own.
        const sections$ = combineLatest([settings$, aspect$]).pipe(
            map(([settings, aspect]) => exportSections(settings, aspect)),
        );

        const summarised$ = summary$.pipe(
            distinctUntilChanged(),
            tap(text => {
                this.summary.textContent = text;
            }),
        );

        const shown$ = status$.pipe(
            tap(status => {
                const running = status.kind === 'running';
                // Disabled in place rather than swapped for Cancel, or a double-click would start and stop an export.
                this.start.disabled = running;
                this.cancel.hidden = !running;
                this.toggleAttribute('data-failed', status.kind === 'failed');
                this.status.textContent =
                    status.kind === 'running'
                        ? `exporting ${Math.floor(status.done * 100)}%`
                        : status.kind === 'failed'
                          ? status.message
                          : '';
            }),
        );

        const saved$ = files$.pipe(
            tap(({ blob, name }) => {
                saveFile(blob, name);
            }),
        );

        return merge(
            this.rendering.lifetime$,
            this.properties.connect$(sections$).pipe(map(() => undefined)),
            merge(summarised$, shown$, saved$).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-export-panel', HksExportPanel);
