import { combineLatest, EMPTY, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, saveFile, styleSheet } from '../../../lib/dom.ts';
import { fromElementEvent$ } from '../../../lib/rx.ts';
import { CYCLES, DRAW_MODES, KNOBS, defaultPanel, isKnob, type DrawMode } from '../params.ts';
import { FITS, LATTICES, LENSES, SPACES } from '../space.ts';
import {
    FLAGS,
    NUMERIC_FIELDS,
    isFlag,
    isNumericField,
    numberOf,
    type ControlChange,
    type ControlsView,
    type NumericField,
} from './controls.ts';
import css from './sketch-controls.css?inline';

const sheet = styleSheet(css);

const slider = (
    key: string,
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    only: DrawMode | null = null,
) => `
    <label class="item"${only === null ? '' : ` data-only="${only}"`}${isKnob(key) ? ` data-knob="${key}" hidden` : ''}>
        <span class="key">${label}</span>
        <input class="dial" data-field="${key}" type="range"
               min="${min}" max="${max}" step="${step}" value="${value}" />
        <output class="read" data-read="${key}"></output>
        ${isKnob(key) ? cycles(key) : ''}
    </label>
`;

const cycles = (knob: string) => `
    <select class="pick cycles" data-cycles="${knob}" aria-label="${knob} motion" title="swing per loop">
        ${CYCLES.map(count => `<option value="${count}">${count === 0 ? 'still' : `${count}× / loop`}</option>`).join('')}
    </select>
`;

const flag = (key: string, label: string) => `
    <label class="item toggle">
        <input class="switch" data-flag="${key}" type="checkbox" />
        <span class="key">${label}</span>
    </label>
`;

const option = (key: string, values: readonly string[]) => `
    <label class="item">
        <span class="key">${key}</span>
        <select class="pick" data-pick="${key}" aria-label="${key}">
            ${values.map(value => `<option value="${value}">${value}</option>`).join('')}
        </select>
    </label>
`;

const choice = (key: string, label: string) => `
    <label class="item">
        <span class="key">${label}</span>
        <select class="pick" data-pick="${key}" aria-label="${label}"></select>
    </label>
`;

const modes = DRAW_MODES.map(
    mode => `
        <label class="segment">
            <input type="radio" name="mode" value="${mode}"${mode === defaultPanel.mode ? ' checked' : ''} />
            <span>${mode}</span>
        </label>
    `,
).join('');

const TEMPLATE = `
    <div class="bar" role="group" aria-label="sketch parameters">
        ${choice('formula', 'formula')}
        ${choice('theme', 'theme')}
        <div class="segments" role="radiogroup" aria-label="draw mode">${modes}</div>
        ${flag('axes', 'axes')}
        ${option('fit', FITS)}
        ${option('lens', LENSES)}
        ${option('lattice', LATTICES)}
        ${slider('focus', 'focus', 0.3, 3, 0.05, defaultPanel.focus)}
        ${option('space', SPACES)}
        <button class="item reset" type="button" title="reset camera" aria-label="reset camera" disabled>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 a8 8 0 1 0 2.4 -5.7 M4 4 V8.5 H8.5"/></svg>
            <span>reset view</span>
        </button>
        <button class="item capture record" type="button" title="render one loop of the timeline to a video file">
            <span class="dot" aria-hidden="true"></span>
            <span class="label">record loop</span>
        </button>
        <button class="item capture still" type="button" title="save the current frame as a PNG">
            <span class="label">snapshot</span>
        </button>
        ${slider('dimension', 'lattice', 1, 128, 1, defaultPanel.dimension)}
        ${slider('baseSize', 'dot', 1, 20, 1, defaultPanel.baseSize, 'dots')}
        ${slider('depthScalar', 'depth', 0.01, 2, 0.01, defaultPanel.depthScalar, 'dots')}
        ${slider('trails', 'trails', 0, 0.97, 0.01, defaultPanel.trails)}
        ${KNOBS.map(knob => slider(knob, knob, 0, 1, 0.01, defaultPanel.knobs[knob])).join('')}
    </div>
`;

export type SavedFile = {
    readonly blob: Blob;
    readonly name: string;
};

export type PresetOption = {
    readonly value: string;
    readonly label: string;
};

const readout = (field: NumericField, value: number): string =>
    field === 'dimension' || field === 'baseSize' ? String(value) : value.toFixed(2);

export class HksSketchControls extends HTMLElement {
    readonly changes$: Observable<ControlChange>;
    readonly resets$: Observable<void>;
    readonly records$: Observable<void>;
    readonly snapshots$: Observable<void>;

    private readonly shadow: ShadowRoot;
    private readonly reset: HTMLButtonElement;
    private readonly record: HTMLButtonElement;

    constructor() {
        super();

        this.shadow = this.attachShadow({ mode: 'open' });
        this.shadow.adoptedStyleSheets = [sheet];
        this.shadow.innerHTML = TEMPLATE;

        const bar = requireChild(this.shadow, '.bar');
        this.reset = requireElement(this.shadow, '.reset', HTMLButtonElement);
        this.resets$ = fromElementEvent$(this.reset, 'click').pipe(map(() => undefined));
        this.record = requireElement(this.shadow, '.record', HTMLButtonElement);
        this.records$ = fromElementEvent$(this.record, 'click').pipe(map(() => undefined));
        this.snapshots$ = fromElementEvent$(
            requireElement(this.shadow, '.still', HTMLButtonElement),
            'click',
        ).pipe(map(() => undefined));

        this.changes$ = merge(
            fromElementEvent$(bar, 'input').pipe(
                mergeMap(({ target }): Observable<ControlChange> => {
                    const field =
                        target instanceof HTMLInputElement ? target.dataset['field'] : undefined;

                    return target instanceof HTMLInputElement &&
                        field !== undefined &&
                        isNumericField(field)
                        ? of({ field, value: Number(target.value) })
                        : EMPTY;
                }),
            ),
            fromElementEvent$(bar, 'change').pipe(
                mergeMap(({ target }): Observable<ControlChange> => {
                    const knob =
                        target instanceof HTMLSelectElement ? target.dataset['cycles'] : undefined;

                    if (target instanceof HTMLSelectElement && knob !== undefined && isKnob(knob)) {
                        return of({ field: 'cycles', knob, value: Number(target.value) });
                    }

                    if (target instanceof HTMLSelectElement) {
                        const pick = target.dataset['pick'];

                        return pick === 'formula' ||
                            pick === 'theme' ||
                            pick === 'fit' ||
                            pick === 'lens' ||
                            pick === 'lattice' ||
                            pick === 'space'
                            ? of({ field: pick, value: target.value })
                            : EMPTY;
                    }

                    if (target instanceof HTMLInputElement && target.name === 'mode') {
                        return of({ field: 'mode', value: target.value });
                    }

                    const flag =
                        target instanceof HTMLInputElement ? target.dataset['flag'] : undefined;

                    return target instanceof HTMLInputElement && flag !== undefined && isFlag(flag)
                        ? of({ field: flag, value: target.checked })
                        : EMPTY;
                }),
            ),
        );
    }

    presets(themes: readonly PresetOption[]): this {
        this.pick('theme').replaceChildren(
            ...themes.map(({ value, label }) => new Option(label, value)),
        );

        return this;
    }

    private pick(key: string): HTMLSelectElement {
        return requireElement(this.shadow, `[data-pick="${key}"]`, HTMLSelectElement);
    }

    // Writes every value back: the fold owns them, so a programmatic write raises no event to loop on.
    connect$(
        view$: Observable<ControlsView>,
        knobs$: Observable<readonly string[]>,
        formulas$: Observable<readonly PresetOption[]>,
        // null when idle, else how far the capture is, from 0 to 1.
        capture$: Observable<number | null>,
        files$: Observable<SavedFile>,
    ): Observable<void> {
        // Together: options rebuilt after the value was set would drop the selection.
        const formula$ = combineLatest([formulas$, view$.pipe(map(({ formula }) => formula))]).pipe(
            tap(([options, value]) => {
                const pick = this.pick('formula');
                const current = [...pick.options]
                    .map(option => `${option.value}=${option.label}`)
                    .join();

                if (current !== options.map(option => `${option.value}=${option.label}`).join()) {
                    pick.replaceChildren(
                        ...options.map(({ value: v, label }) => new Option(label, v)),
                    );
                }

                pick.value = value;
            }),
        );

        const picks$ = (['theme', 'fit', 'lens', 'lattice', 'space'] as const).map(key =>
            view$.pipe(
                map(view => view[key]),
                distinctUntilChanged(),
                tap(value => {
                    this.pick(key).value = value;
                }),
            ),
        );

        const numbers$ = NUMERIC_FIELDS.map(field =>
            view$.pipe(
                map(view => numberOf(view, field)),
                distinctUntilChanged(),
                tap(value => {
                    requireElement(this.shadow, `[data-field="${field}"]`, HTMLInputElement).value =
                        String(value);
                    requireElement(
                        this.shadow,
                        `[data-read="${field}"]`,
                        HTMLOutputElement,
                    ).textContent = readout(field, value);
                }),
            ),
        );

        const motion$ = KNOBS.map(knob =>
            view$.pipe(
                map(({ motion }) => String(motion[knob])),
                distinctUntilChanged(),
                tap(value => {
                    requireElement(
                        this.shadow,
                        `[data-cycles="${knob}"]`,
                        HTMLSelectElement,
                    ).value = value;
                }),
            ),
        );

        const mode$ = view$.pipe(
            map(({ mode }) => mode),
            distinctUntilChanged(),
            tap(mode => {
                for (const radio of this.shadow.querySelectorAll('input[name="mode"]')) {
                    if (radio instanceof HTMLInputElement) {
                        radio.checked = radio.value === mode;
                    }
                }

                for (const row of this.shadow.querySelectorAll('[data-only]')) {
                    if (row instanceof HTMLElement) {
                        row.hidden = row.dataset['only'] !== mode;
                    }
                }
            }),
        );

        const flags$ = FLAGS.map(flag =>
            view$.pipe(
                map(view => view[flag]),
                distinctUntilChanged(),
                tap(on => {
                    requireElement(this.shadow, `[data-flag="${flag}"]`, HTMLInputElement).checked =
                        on;
                }),
            ),
        );

        const shown$ = knobs$.pipe(
            map(knobs => knobs.join()),
            distinctUntilChanged(),
            tap(joined => {
                const used = joined.split(',');

                for (const row of this.shadow.querySelectorAll('[data-knob]')) {
                    if (row instanceof HTMLElement) {
                        row.hidden = !used.includes(row.dataset['knob'] ?? '');
                    }
                }
            }),
        );

        const turned$ = view$.pipe(
            map(({ turned }) => turned),
            distinctUntilChanged(),
            tap(turned => {
                this.reset.disabled = !turned;
            }),
        );

        const recording$ = capture$.pipe(
            map(progress => (progress === null ? null : Math.floor(progress * 100))),
            distinctUntilChanged(),
            tap(percent => {
                const label = requireElement(this.record, '.label', HTMLElement);
                label.textContent = percent === null ? 'record loop' : `recording ${percent}%`;
                this.record.disabled = percent !== null;
                this.toggleAttribute('data-recording', percent !== null);
            }),
        );

        const saved$ = files$.pipe(
            tap(({ blob, name }) => {
                saveFile(blob, name);
            }),
        );

        return merge(
            recording$,
            saved$,
            formula$,
            ...picks$,
            ...numbers$,
            ...flags$,
            ...motion$,
            mode$,
            shown$,
            turned$,
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-sketch-controls', HksSketchControls);
