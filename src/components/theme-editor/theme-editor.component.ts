import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { mountView, renderView, type RenderView, type Rendering } from '../../lib/lit.ts';
import { EMPTY, merge, of, type Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import type { Stop, Theme } from '../../model/sketch/theme.ts';
import { gradientCss } from './gradient.ts';
import type { ThemeEdit } from './theme-edit.ts';
import css from './theme-editor.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = () =>
    html`<slot></slot>
        <div class="bar"></div>
        <div class="body" data-detail>
            <div class="stops"></div>
            <button class="ui-button add" type="button" data-command="add">add stop</button>
        </div>`;

const commandOf = (target: EventTarget | null): string | undefined => {
    const button = target instanceof Element ? target.closest('[data-command]') : null;

    return button instanceof HTMLElement ? button.dataset['command'] : undefined;
};

export class HksThemeEditor extends HTMLElement {
    readonly edits$: Observable<ThemeEdit>;

    private readonly stops: HTMLElement;
    private readonly bar: HTMLElement;

    private readonly rendering: Rendering;

    private readonly stopView: RenderView<readonly Stop[]>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());

        this.stops = requireChild(shadow, '.stops');
        this.bar = requireChild(shadow, '.bar');
        this.stopView = renderView<readonly Stop[]>(this.stops, [], stops =>
            repeat(
                stops,
                (_item, index) => index,
                (stop, index) =>
                    html`<div class="stop">
                        <input
                            class="ui-range at"
                            data-variant="precision"
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            .value=${stop.at}
                            aria-label=${ifDefined(`stop ${index + 1} position`)}
                        /><input
                            class="ui-colour hue"
                            data-variant="rect"
                            type="color"
                            .value=${stop.color}
                            aria-label=${ifDefined(`stop ${index + 1} colour`)}
                        /><button
                            class="ui-icon drop"
                            type="button"
                            data-command=${ifDefined(index)}
                            aria-label=${ifDefined(`remove stop ${index + 1}`)}
                            ?disabled=${stops.length < 2}
                        >
                            ×
                        </button>
                    </div>`,
            ),
        );
        const body = requireChild(shadow, '.body');

        // The stops are read from their rows: a position being dragged is ahead of the theme it came from.
        this.edits$ = merge(
            fromElementEvent$(this.stops, 'input').pipe(
                map((): ThemeEdit => ({ kind: 'stops', stops: this.read() })),
            ),
            fromElementEvent$(body, 'click').pipe(
                mergeMap((event): Observable<ThemeEdit> => {
                    const command = commandOf(event.target);
                    const index = Number(command);

                    return command === 'add'
                        ? of({ kind: 'add' })
                        : command === undefined || !Number.isInteger(index) || index < 0
                          ? EMPTY
                          : of({ kind: 'remove', index });
                }),
            ),
        );
    }

    connect$(rows$: Observable<Theme>, gradient$: Observable<Theme>): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            this.stopView.lifetime$,
            merge(
                rows$.pipe(
                    tap(({ stops }) => {
                        this.stopView.update(stops);
                    }),
                ),
                gradient$.pipe(
                    map(gradientCss),
                    tap(background => {
                        this.bar.style.background = background;
                    }),
                ),
            ).pipe(map(() => undefined)),
        );
    }

    private read(): readonly Stop[] {
        return [...this.stops.children].map((row): Stop => ({
            at: Number(requireElement(row, '.at', HTMLInputElement).value),
            color: requireElement(row, '.hue', HTMLInputElement).value,
        }));
    }
}

customElements.define('hks-theme-editor', HksThemeEditor);
