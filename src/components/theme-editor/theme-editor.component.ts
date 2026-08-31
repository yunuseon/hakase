import { concat, defer, EMPTY, merge, of, type Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { gradientCss, ordered, type Blend, type Stop, type Theme } from '../sketch/theme.ts';
import css from './theme-editor.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <div class="head">
        <span class="key">theme</span>
        <select class="pick" aria-label="theme"></select>
    </div>
    <div class="bar"></div>
    <div class="body">
        <label class="row">
            <span class="key">blend</span>
            <select class="blend" aria-label="blend">
                <option value="smooth">smooth</option>
                <option value="steps">steps</option>
            </select>
        </label>
        <div class="stops"></div>
        <button class="add" type="button" data-command="add">add stop</button>
    </div>
`;

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

    constructor() {
        super();

        this.shadow = this.attachShadow({ mode: 'open' });
        this.shadow.adoptedStyleSheets = [sheet];
        this.shadow.innerHTML = TEMPLATE;

        this.stops = requireChild(this.shadow, '.stops');
        this.bar = requireChild(this.shadow, '.bar');

        const picker = requireElement(this.shadow, '.pick', HTMLSelectElement);
        const body = requireChild(this.shadow, '.body');

        // Deferred: the current option is only known once presets() has filled the list.
        this.selections$ = defer(() =>
            concat(
                of(picker.value),
                fromElementEvent$(picker, 'change').pipe(map(() => picker.value)),
            ),
        );

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
        const picker = requireElement(this.shadow, '.pick', HTMLSelectElement);

        picker.replaceChildren(
            ...options.map(({ value, label }) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;

                return option;
            }),
        );

        return this;
    }

    connect$(rows$: Observable<Theme>, gradient$: Observable<Theme>): Observable<void> {
        return merge(
            rows$.pipe(tap(theme => this.render(theme))),
            gradient$.pipe(
                map(gradientCss),
                tap(background => {
                    this.bar.style.background = background;
                }),
            ),
        ).pipe(map(() => undefined));
    }

    private read(): Theme {
        const blend = requireElement(this.shadow, '.blend', HTMLSelectElement).value;

        const stops = [...this.stops.children].map((row): Stop => ({
            at: Number(requireElement(row, '.at', HTMLInputElement).value),
            color: requireElement(row, '.hue', HTMLInputElement).value,
        }));

        return { stops: ordered(stops), blend: blend === 'steps' ? 'steps' : 'smooth' };
    }

    private render({ stops, blend }: Theme): void {
        requireElement(this.shadow, '.blend', HTMLSelectElement).value = blend;

        this.stops.replaceChildren(
            ...stops.map((stop, index) => {
                const row = document.createElement('div');
                row.className = 'row stop';

                const at = document.createElement('input');
                at.className = 'at';
                at.type = 'range';
                at.min = '0';
                at.max = '1';
                at.step = '0.01';
                at.value = String(stop.at);
                at.setAttribute('aria-label', `stop ${String(index + 1)} position`);

                const hue = document.createElement('input');
                hue.className = 'hue';
                hue.type = 'color';
                hue.value = stop.color;
                hue.setAttribute('aria-label', `stop ${String(index + 1)} colour`);

                const drop = document.createElement('button');
                drop.className = 'drop';
                drop.type = 'button';
                drop.dataset['command'] = String(index);
                drop.textContent = '×';
                drop.setAttribute('aria-label', `remove stop ${String(index + 1)}`);
                drop.disabled = stops.length < 2;

                row.append(at, hue, drop);

                return row;
            }),
        );
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
