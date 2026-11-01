import { combineLatest, EMPTY, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../../lib/dom.ts';
import { fromElementEvent$ } from '../../../lib/rx.ts';
import {
    CYCLES,
    DRAW_MODES,
    KNOBS,
    defaultPanel,
    isKnob,
    type DrawMode,
    type Knob,
} from '../params.ts';
import { FITS, LATTICES, LENSES, SPACES } from '../space.ts';
import { TABS } from '../animation.ts';
import {
    FLAGS,
    GROUPS,
    NUMERIC_FIELDS,
    isFlag,
    isGroup,
    isNumericField,
    numberOf,
    type ControlChange,
    type ControlsView,
    type Group,
    type KnobView,
    type NumericField,
    sameKnobViews,
} from './controls.ts';
import css from './sketch-controls.css?inline';

const sheet = styleSheet(css);

const RESET_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 a8 8 0 1 0 2.4 -5.7 M4 4 V8.5 H8.5"/></svg>';

const slider = (
    key: string,
    label: string,
    hint: string,
    min: number,
    max: number,
    step: number,
    value: number,
    only: DrawMode | null = null,
) => `
    <label class="row"${only === null ? '' : ` data-only="${only}"`} title="${hint}">
        <span class="key">${label}</span>
        <input class="dial" data-field="${key}" type="range"
               min="${min}" max="${max}" step="${step}" value="${value}" />
        <output class="read" data-read="${key}"></output>
    </label>
`;

const knobRow = (knob: Knob) => `
    <div class="knob" data-knob="${knob}" hidden>
        <label class="row">
            <span class="key" data-label="${knob}">${knob}</span>
            <input class="dial" data-field="${knob}" type="range" min="0" max="1" step="0.01"
                   value="${defaultPanel.knobs[knob]}" />
            <output class="read" data-read="${knob}"></output>
        </label>
        <select class="pick motion" data-cycles="${knob}" aria-label="${knob} motion"
                title="let it swing from 0 to its value and back, a whole number of times per loop">
            ${CYCLES.map(count => `<option value="${count}">${count === 0 ? 'still' : `${count}× per loop`}</option>`).join('')}
        </select>
    </div>
`;

const segments = (name: string, label: string, values: readonly string[], hint: string) => `
    <div class="row" title="${hint}">
        <span class="key">${label}</span>
        <div class="segments" role="radiogroup" aria-label="${label}">
            ${values
                .map(
                    value => `
                        <label class="segment">
                            <input type="radio" name="${name}" value="${value}" />
                            <span>${value}</span>
                        </label>`,
                )
                .join('')}
        </div>
    </div>
`;

const option = (key: string, label: string, values: readonly string[], hint: string) => `
    <label class="row" title="${hint}">
        <span class="key">${label}</span>
        <select class="pick" data-pick="${key}" aria-label="${label}">
            ${values.map(value => `<option value="${value}">${value}</option>`).join('')}
        </select>
    </label>
`;

const flag = (key: string, label: string, hint: string) => `
    <label class="row" title="${hint}">
        <span class="key">${label}</span>
        <input class="switch" data-flag="${key}" type="checkbox" />
    </label>
`;

const choice = (key: string, label: string) => `
    <label class="item">
        <span class="key">${label}</span>
        <select class="pick" data-pick="${key}" aria-label="${label}"></select>
    </label>
`;

const reset = (group: Group, what: string) => `
    <button class="reset" type="button" data-reset="${group}" title="reset ${what}" aria-label="reset ${what}" disabled>
        ${RESET_ICON}
    </button>
`;

const group = (name: Group, title: string, rows: string) => `
    <section class="group" aria-label="${title}">
        <header class="group-head">
            <h3>${title}</h3>
            ${reset(name, title.toLowerCase())}
        </header>
        ${rows}
    </section>
`;

const tabs = TABS.map(
    tab => `
        <label class="segment">
            <input type="radio" name="tab" value="${tab}"${tab === 'parameters' ? ' checked' : ''} />
            <span>${tab}</span>
        </label>
    `,
).join('');

const TEMPLATE = `
    <div class="head">
        <div class="segments tabs" role="radiogroup" aria-label="sketch panels">${tabs}</div>
        <div class="document" role="group" aria-label="what the sketch shows">
            ${choice('formula', 'formula')}
            ${choice('theme', 'theme')}
        </div>
    </div>
    <div class="panes">
        <section class="pane" data-pane="parameters" aria-label="the formula's parameters">
            <header class="group-head">
                <h3>Parameters</h3>
                <button class="reset labelled" type="button" data-reset="parameters" disabled>
                    ${RESET_ICON}<span>reset parameters</span>
                </button>
            </header>
            <div class="knobs">${KNOBS.map(knobRow).join('')}</div>
            <p class="empty">This formula reads no knobs. Use k1 to k4 in its code and they appear here.</p>
        </section>
        <div class="pane groups" data-pane="scene" hidden>
            ${group(
                'sampling',
                'Sampling',
                `${option('lattice', 'lattice', LATTICES, 'where the formula is evaluated')}
                 ${slider('dimension', 'density', 'how many points: the lattice has twice this many on a side', 1, 128, 1, defaultPanel.dimension)}
                 ${slider('focus', 'focus', 'bunch the points toward the middle (above 1) or the edges (below 1)', 0.3, 3, 0.05, defaultPanel.focus)}`,
            )}
            ${group(
                'drawing',
                'Drawing',
                `${segments('mode', 'mode', DRAW_MODES, 'how each point is drawn')}
                 ${slider('baseSize', 'dot size', 'the size of a dot at the camera target, in screen pixels', 1, 20, 1, defaultPanel.baseSize, 'dots')}
                 ${slider('depthScalar', 'depth', 'how much nearer dots grow and farther ones shrink', 0.01, 2, 0.01, defaultPanel.depthScalar, 'dots')}
                 ${slider('trails', 'trails', 'fade each frame into the next instead of clearing it', 0, 0.97, 0.01, defaultPanel.trails)}
                 ${flag('axes', 'axes', 'draw x, y and z and the -1 to 1 square')}`,
            )}
            ${group(
                'space',
                'Space',
                option(
                    'space',
                    'space',
                    SPACES,
                    'the coordinate system the formula output is read in',
                ),
            )}
            ${group(
                'camera',
                'Camera',
                `${segments('lens', 'lens', LENSES, 'perspective shrinks what is far away; orthographic keeps sizes')}
                 ${segments('fit', 'fit', FITS, 'how the -1 to 1 square meets a canvas that is not square')}
                 <div class="row">
                     <span class="key">view</span>
                     <button class="view" type="button" title="undo your own turning and zooming of the camera" disabled>
                         ${RESET_ICON}<span>reset view</span>
                     </button>
                 </div>`,
            )}
        </div>
        <div class="pane animation" data-pane="animation" hidden><slot name="animation"></slot></div>
    </div>
`;

export type PresetOption = {
    readonly value: string;
    readonly label: string;
};

const readout = (field: NumericField, value: number): string =>
    field === 'dimension' || field === 'baseSize' ? String(value) : value.toFixed(2);

const RADIOS = ['mode', 'lens', 'fit'] as const;

export class HksSketchControls extends HTMLElement {
    readonly changes$: Observable<ControlChange>;
    readonly resets$: Observable<void>;

    private readonly shadow: ShadowRoot;
    private readonly view: HTMLButtonElement;
    private readonly empty: HTMLElement;

    constructor() {
        super();

        this.shadow = this.attachShadow({ mode: 'open' });
        this.shadow.adoptedStyleSheets = [sheet];
        this.shadow.innerHTML = TEMPLATE;

        const panes = requireChild(this.shadow, '.panes');
        this.empty = requireChild(this.shadow, '.empty');
        this.view = requireElement(this.shadow, '.view', HTMLButtonElement);
        this.resets$ = fromElementEvent$(this.view, 'click').pipe(map(() => undefined));

        this.changes$ = merge(
            // Above every tab: the formula and theme decide what the parameters draw and what the animation exports.
            fromElementEvent$(requireChild(this.shadow, '.head'), 'change').pipe(
                mergeMap(({ target }): Observable<ControlChange> => {
                    if (target instanceof HTMLInputElement && target.name === 'tab') {
                        return of({ field: 'tab', value: target.value });
                    }

                    const pick =
                        target instanceof HTMLSelectElement ? target.dataset['pick'] : undefined;

                    return target instanceof HTMLSelectElement &&
                        (pick === 'formula' || pick === 'theme')
                        ? of({ field: pick, value: target.value })
                        : EMPTY;
                }),
            ),
            fromElementEvent$(panes, 'click').pipe(
                mergeMap(({ target }): Observable<ControlChange> => {
                    const button =
                        target instanceof Element ? target.closest('[data-reset]') : null;
                    const name =
                        button instanceof HTMLElement ? button.dataset['reset'] : undefined;

                    return name !== undefined && isGroup(name)
                        ? of({ field: 'reset', group: name })
                        : EMPTY;
                }),
            ),
            fromElementEvent$(panes, 'input').pipe(
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
            fromElementEvent$(panes, 'change').pipe(
                mergeMap(({ target }): Observable<ControlChange> => {
                    if (target instanceof HTMLSelectElement) {
                        const knob = target.dataset['cycles'];

                        if (knob !== undefined && isKnob(knob)) {
                            return of({ field: 'cycles', knob, value: Number(target.value) });
                        }

                        const pick = target.dataset['pick'];

                        return pick === 'lattice' || pick === 'space'
                            ? of({ field: pick, value: target.value })
                            : EMPTY;
                    }

                    if (!(target instanceof HTMLInputElement)) {
                        return EMPTY;
                    }

                    const radio = RADIOS.find(name => name === target.name);

                    if (radio !== undefined) {
                        return of({ field: radio, value: target.value });
                    }

                    const flag = target.dataset['flag'];

                    return flag !== undefined && isFlag(flag)
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

    private checkRadio(name: string, value: string): void {
        for (const radio of this.shadow.querySelectorAll(`input[name="${name}"]`)) {
            if (radio instanceof HTMLInputElement) {
                radio.checked = radio.value === value;
            }
        }
    }

    // Writes every value back: the fold owns them, so a programmatic write raises no event to loop on.
    connect$(
        view$: Observable<ControlsView>,
        knobs$: Observable<readonly KnobView[]>,
        formulas$: Observable<readonly PresetOption[]>,
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

        const picks$ = (['theme', 'lattice', 'space'] as const).map(key =>
            view$.pipe(
                map(view => view[key]),
                distinctUntilChanged(),
                tap(value => {
                    this.pick(key).value = value;
                }),
            ),
        );

        const radios$ = RADIOS.map(name =>
            view$.pipe(
                map(view => view[name]),
                distinctUntilChanged(),
                tap(value => {
                    this.checkRadio(name, value);
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

        const only$ = view$.pipe(
            map(({ mode }) => mode),
            distinctUntilChanged(),
            tap(mode => {
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
            distinctUntilChanged(sameKnobViews),
            tap(knobs => {
                for (const row of this.shadow.querySelectorAll('[data-knob]')) {
                    if (row instanceof HTMLElement) {
                        const used = knobs.find(({ knob }) => knob === row.dataset['knob']);
                        row.hidden = used === undefined;
                        requireChild(row, '.key').textContent = used?.label ?? '';
                    }
                }

                this.empty.hidden = knobs.length > 0;
            }),
        );

        const resets$ = GROUPS.map(name =>
            view$.pipe(
                map(({ changed }) => changed[name]),
                distinctUntilChanged(),
                tap(changed => {
                    for (const button of this.shadow.querySelectorAll(`[data-reset="${name}"]`)) {
                        if (button instanceof HTMLButtonElement) {
                            button.disabled = !changed;
                        }
                    }
                }),
            ),
        );

        const turned$ = view$.pipe(
            map(({ turned }) => turned),
            distinctUntilChanged(),
            tap(turned => {
                this.view.disabled = !turned;
            }),
        );

        const tab$ = view$.pipe(
            map(({ tab }) => tab),
            distinctUntilChanged(),
            tap(tab => {
                this.checkRadio('tab', tab);

                for (const pane of this.shadow.querySelectorAll('[data-pane]')) {
                    if (pane instanceof HTMLElement) {
                        pane.hidden = pane.dataset['pane'] !== tab;
                    }
                }
            }),
        );

        return merge(
            tab$,
            formula$,
            ...picks$,
            ...radios$,
            ...numbers$,
            ...flags$,
            ...motion$,
            ...resets$,
            only$,
            shown$,
            turned$,
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-sketch-controls', HksSketchControls);
