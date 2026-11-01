import { merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, saveFile, styleSheet } from '../../../lib/dom.ts';
import { fromElementEvent$ } from '../../../lib/rx.ts';
import {
    EXPORT_SIZES,
    FRAME_RATES,
    QUALITIES,
    type ExportChange,
    type ExportSettings,
} from '../animation.ts';
import css from './export-panel.css?inline';

const sheet = styleSheet(css);

const select = (field: string, label: string, options: readonly (readonly [string, string])[]) => `
    <label class="item"${field === 'quality' ? ' data-video' : ''}>
        <span class="key">${label}</span>
        <select class="pick" data-field="${field}" aria-label="${label}">
            ${options.map(([value, text]) => `<option value="${value}">${text}</option>`).join('')}
        </select>
    </label>
`;

const TEMPLATE = `
    <div class="row">
        ${select('format', 'format', [
            ['webm', 'WebM video'],
            ['png', 'PNG frames (zip)'],
        ])}
        ${select(
            'fps',
            'fps',
            FRAME_RATES.map(rate => [String(rate), String(rate)]),
        )}
        ${select(
            'size',
            'size',
            EXPORT_SIZES.map(size => [String(size), `${size} px`]),
        )}
        ${select(
            'quality',
            'quality',
            QUALITIES.map(quality => [quality, quality]),
        )}
    </div>
    <div class="row actions">
        <span class="summary"></span>
        <span class="status" role="status"></span>
        <button class="button cancel" type="button" hidden>Cancel</button>
        <button class="button still" type="button" title="save the frame under the playhead as a PNG">Save frame</button>
        <button class="button primary start" type="button">Export</button>
    </div>
`;

export type SavedFile = {
    readonly blob: Blob;
    readonly name: string;
};

export type ExportStatus =
    | { readonly kind: 'idle' }
    | { readonly kind: 'running'; readonly done: number }
    | { readonly kind: 'failed'; readonly message: string };

const NUMERIC = ['fps', 'size'] as const;
const TEXT = ['format', 'quality'] as const;

export class HksExportPanel extends HTMLElement {
    readonly changes$: Observable<ExportChange>;
    readonly starts$: Observable<void>;
    readonly cancels$: Observable<void>;
    readonly stills$: Observable<void>;

    private readonly shadow: ShadowRoot;
    private readonly start: HTMLButtonElement;
    private readonly cancel: HTMLButtonElement;
    private readonly summary: HTMLElement;
    private readonly status: HTMLElement;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

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

        // On the row inside the shadow root: change is not composed, so it never reaches the host.
        this.changes$ = fromElementEvent$(requireChild(shadow, '.row'), 'change').pipe(
            mergeMap(({ target }): ExportChange[] => {
                const field =
                    target instanceof HTMLSelectElement ? target.dataset['field'] : undefined;

                if (!(target instanceof HTMLSelectElement) || field === undefined) {
                    return [];
                }

                const numeric = NUMERIC.find(name => name === field);
                const text = TEXT.find(name => name === field);

                if (numeric !== undefined) {
                    return [{ field: numeric, value: Number(target.value) }];
                }

                return text === undefined ? [] : [{ field: text, value: target.value }];
            }),
        );
    }

    private pick(field: string): HTMLSelectElement {
        return requireElement(this.shadow, `[data-field="${field}"]`, HTMLSelectElement);
    }

    connect$(
        settings$: Observable<ExportSettings>,
        summary$: Observable<string>,
        status$: Observable<ExportStatus>,
        files$: Observable<SavedFile>,
    ): Observable<void> {
        const fields$ = [...NUMERIC, ...TEXT].map(field =>
            settings$.pipe(
                map(settings => String(settings[field])),
                distinctUntilChanged(),
                tap(value => {
                    this.pick(field).value = value;
                }),
            ),
        );

        const video$ = settings$.pipe(
            map(({ format }) => format === 'webm'),
            distinctUntilChanged(),
            tap(video => {
                requireElement(this.shadow, '[data-video]', HTMLElement).hidden = !video;
            }),
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

        return merge(...fields$, video$, summarised$, shown$, saved$).pipe(map(() => undefined));
    }
}

customElements.define('hks-export-panel', HksExportPanel);
