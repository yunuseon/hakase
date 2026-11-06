import { html } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { ifDefined } from 'lit-html/directives/if-defined.js';

import { renderOptions, type SelectChoice } from '../../shared/select/options.component.ts';
import { mountView, renderView, type RenderView, type Rendering } from '../../lib/lit.ts';
import { HksSelect, connectSelects$ } from '../../shared/select/select.component.ts';
import { EMPTY, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { gradientCss, ordered, type Blend, type Stop, type Theme } from '../sketch/theme.ts';
import css from './theme-editor.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = () =>
    html`<div class="head">
            <span class="key">theme</span><hks-select class="pick" aria-label="theme"></hks-select>
        </div>
        <div class="bar"></div>
        <div class="body">
            <label class="row"
                ><span class="key">blend</span
                ><hks-select class="blend" aria-label="blend"
                    ><option value="smooth">smooth</option>
                    <option value="steps">steps</option></hks-select
                ></label
            >
            <div class="stops"></div>
            <button class="add" type="button" data-command="add">add stop</button>
        </div>`;

export type PresetOption = {
    readonly value: string;
    readonly label: string;
};

const commandOf = (target: EventTarget | null): string | undefined => {
    const button = target instanceof Element ? target.closest('[data-command]') : null;

    return button instanceof HTMLElement ? button.dataset['command'] : undefined;
};

export class HksThemeEditor extends HTMLElement {
    readonly selections$: Observable<string>;
    readonly changes$: Observable<Theme>;

    private readonly shadow: ShadowRoot;
    private readonly stops: HTMLElement;
    private readonly bar: HTMLElement;

    private readonly rendering: Rendering;

    private readonly stopView: RenderView<readonly Stop[]>;
    private readonly optionsView: RenderView<readonly SelectChoice[]>;

    constructor() {
        super();

        this.shadow = this.attachShadow({ mode: 'open' });
        this.shadow.adoptedStyleSheets = [sheet];
        this.rendering = mountView(this.shadow, () => TEMPLATE());

        this.stops = requireChild(this.shadow, '.stops');
        this.bar = requireChild(this.shadow, '.bar');
        this.stopView = renderView<readonly Stop[]>(this.stops, [], stops =>
            repeat(
                stops,
                (_item, index) => index,
                (stop, index) =>
                    html`<div class="row stop">
                        <input
                            class="at"
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            .value=${stop.at}
                            aria-label=${ifDefined(`stop ${index + 1} position`)}
                        /><input
                            class="hue"
                            type="color"
                            .value=${stop.color}
                            aria-label=${ifDefined(`stop ${index + 1} colour`)}
                        /><button
                            class="drop"
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

        const picker = requireElement(this.shadow, '.pick', HksSelect);
        this.optionsView = renderOptions(picker);
        const body = requireChild(this.shadow, '.body');

        this.selections$ = fromElementEvent$(picker, 'change').pipe(map(() => picker.value));

        // Nothing here edits the DOM: rows only ever change by way of connect$.
        this.changes$ = merge(
            fromElementEvent$(body, 'input').pipe(map(() => this.read())),
            fromElementEvent$(body, 'change').pipe(map(() => this.read())),
            fromElementEvent$(body, 'click').pipe(
                mergeMap(event => {
                    const command = commandOf(event.target);
                    const theme = this.read();

                    if (command === 'add') {
                        return of(withExtraStop(theme));
                    }

                    const index = Number(command);

                    return command === undefined || !Number.isInteger(index) || index < 0
                        ? EMPTY
                        : of(withoutStop(theme, index));
                }),
            ),
        );
    }

    presets(options: readonly PresetOption[]): this {
        this.optionsView.update(options);

        return this;
    }

    connect$(
        selected$: Observable<string>,
        rows$: Observable<Theme>,
        gradient$: Observable<Theme>,
    ): Observable<void> {
        const picker = requireElement(this.shadow, '.pick', HksSelect);

        return merge(
            this.rendering.lifetime$,
            this.optionsView.lifetime$,
            this.stopView.lifetime$,
            merge(
                connectSelects$(this.shadow),
                selected$.pipe(
                    distinctUntilChanged(),
                    tap(value => {
                        picker.value = value;
                    }),
                ),
                rows$.pipe(tap(theme => this.render(theme))),
                gradient$.pipe(
                    map(gradientCss),
                    tap(background => {
                        this.bar.style.background = background;
                    }),
                ),
            ).pipe(map(() => undefined)),
        );
    }

    private read(): Theme {
        const blend = requireElement(this.shadow, '.blend', HksSelect).value;

        const stops = [...this.stops.children].map((row): Stop => ({
            at: Number(requireElement(row, '.at', HTMLInputElement).value),
            color: requireElement(row, '.hue', HTMLInputElement).value,
        }));

        return { stops: ordered(stops), blend: blend === 'steps' ? 'steps' : 'smooth' };
    }

    private render({ stops, blend }: Theme): void {
        requireElement(this.shadow, '.blend', HksSelect).value = blend;

        this.stopView.update(stops);
    }
}

type Gap = {
    readonly size: number;
    readonly at: number;
    readonly color: string;
};

// Splits the widest gap, so repeated adds spread out instead of piling up at an end.
const withExtraStop = ({ stops, blend }: Theme): Theme => {
    const sorted = ordered(stops);
    const first = sorted[0];

    if (first === undefined) {
        return { blend, stops: [{ at: 0.5, color: '#ffffff' }] };
    }

    if (sorted.length < 2) {
        return {
            blend,
            stops: ordered([...sorted, { at: first.at < 0.5 ? 1 : 0, color: first.color }]),
        };
    }

    const widest = sorted.slice(1).reduce<Gap>(
        (best, stop, index) => {
            const previous = sorted[index] ?? first;
            const size = stop.at - previous.at;

            return size > best.size
                ? { size, at: (previous.at + stop.at) / 2, color: previous.color }
                : best;
        },
        { size: -1, at: 0.5, color: first.color },
    );

    return { blend, stops: ordered([...sorted, { at: widest.at, color: widest.color }]) };
};

// A theme with no stops has no colour at all, so the last one never leaves.
const withoutStop = ({ stops, blend }: Theme, index: number): Theme =>
    stops.length < 2 ? { stops, blend } : { blend, stops: stops.filter((_, at) => at !== index) };

export type { Blend };

customElements.define('hks-theme-editor', HksThemeEditor);
