import { html, nothing } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { combineLatest, type Observable } from 'rxjs';
import { map, startWith, tap } from 'rxjs/operators';
import { renderView, type RenderView } from '../../lib/lit.ts';
import { styleSheet } from '../../lib/dom.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import {
    auditView,
    KINDS,
    type AuditRow,
    type AuditView,
    type Extent,
    type Kind,
} from './audit.ts';
import css from './layout-audit.css?inline';

const sheet = styleSheet(css);

const NAMES: Readonly<Record<Kind, string>> = {
    clipped: 'clipped',
    field: 'field too narrow',
    sideways: 'scrolls sideways',
    scrolls: 'window scrolls',
    cut: 'text cut',
};

const counts = (counts: Readonly<Record<Kind, number>>) =>
    KINDS.filter(kind => counts[kind] > 0).map(
        kind => html`<span class="count" data-kind=${kind}>${counts[kind]} ${NAMES[kind]}</span>`,
    );

const Row = (row: AuditRow) =>
    html`<details class="row" ?data-failing=${row.failing > 0}>
        <summary>
            <span class="title">${row.title}</span>
            <span class="tally">${row.failing === 0 ? 'fits' : `${row.failing} failing`}</span>
        </summary>
        ${row.sizes.map(
            size =>
                html`<section class="size">
                    <h4>${size.size} <span class="extent">${size.extent}</span></h4>
                    <p class="counts">${counts(size.counts)}</p>
                    ${
                        size.findings.length === 0
                            ? nothing
                            : html`<ul class="findings">
                                  ${size.findings.map(
                                      finding =>
                                          html`<li data-kind=${finding.kind}>
                                              ${NAMES[finding.kind]} ·
                                              <code>${finding.label}</code
                                              >${finding.by > 0 ? ` by ${finding.by}px` : ''}
                                          </li>`,
                                  )}
                              </ul>`
                    }
                </section>`,
        )}
    </details>`;

type Shown = { readonly view: AuditView; readonly stage: Extent | null };

const idle: Shown = { view: auditView([], 0), stage: null };

const TEMPLATE = ({ view, stage }: Shown) =>
    html`<header class="head">
            <p class="progress">
                ${
                    view.total === 0
                        ? 'Renders every program at its minimum, compact and regular size and lists what does not fit. Press Run audit.'
                        : view.running
                          ? `Measuring ${view.done} of ${view.total}…`
                          : `${view.broken} of ${view.programs} programs fail, ${view.failing} findings.`
                }
            </p>
            <p class="counts">${counts(view.totals)}</p>
        </header>
        <div
            class="frame"
            ?hidden=${stage === null}
            style=${styleMap(
                stage === null
                    ? {}
                    : { inlineSize: `${stage.width}px`, blockSize: `${stage.height}px` },
            )}
        >
            <div class="strip"></div>
            <div class="body"><slot name="stage"></slot></div>
        </div>
        <div class="rows">${repeat(view.rows, ({ program }) => program, Row)}</div>`;

export class HksLayoutAudit extends HTMLElement {
    private readonly rendering: RenderView<Shown>;

    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView(root, idle, TEMPLATE);
    }

    connect$(view$: Observable<AuditView>, stage$: Observable<Extent | null>): Observable<void> {
        return combineLatest([view$, stage$.pipe(startWith(null))]).pipe(
            tap(([view, stage]) => {
                this.rendering.update({ view, stage });
            }),
            map(() => undefined),
        );
    }
}

customElements.define('hks-layout-audit', HksLayoutAudit);
