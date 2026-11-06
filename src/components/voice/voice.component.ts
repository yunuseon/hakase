import { Icon, ListenIcon } from '../../shared/ui/icon.component.ts';
import { connectChoices$ } from '../../shared/ui/choices.component.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { mountView, type Rendering } from '../../lib/lit.ts';
import { HksSelect, connectSelects$ } from '../../shared/select/select.component.ts';
import { combineLatest, merge, type Observable } from 'rxjs';
import { distinctUntilChanged, filter, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import {
    ARTICULATIONS,
    DECAY,
    GLIDE,
    isArticulation,
    isScale,
    isShape,
    isVoiceInstrument,
    noteName,
    ROOTS,
    SCALES,
    semitonesAt,
    SHAPES,
    VOICE_INSTRUMENTS,
    type Heard,
    type Note,
    type Shape,
    type VoiceCommand,
} from './voice.ts';
import css from './voice.css?inline';

const sheet = styleSheet(css);

const GLYPHS: Readonly<Record<Shape, string>> = {
    sine: 'M2 12 C6 3 10 3 12 12 S18 21 22 12',
    triangle: 'M2 12 L7 5 L17 19 L22 12',
    sawtooth: 'M2 17 L12 6 V17 L22 6 V17',
    square: 'M2 17 V7 H12 V17 H22 V7',
};

const ROOT_NOTES = Array.from(
    { length: ROOTS.high - ROOTS.low + 1 },
    (_, index) => ROOTS.low + index,
);

const TEMPLATE = () =>
    html`<div class="bar">
            <button
                class="ui-listen listen"
                type="button"
                aria-pressed="false"
                title="Listen: the voice plays while its clock does"
            >
                ${ListenIcon()}<span>Listen</span>
            </button>
            <div class="ui-choices shapes" role="radiogroup" aria-label="shape" data-synth>
                ${SHAPES.map(
                    shape =>
                        html`<button
                            class="ui-choice"
                            type="button"
                            role="radio"
                            data-shape=${ifDefined(shape)}
                            aria-label=${ifDefined(shape)}
                            title=${ifDefined(shape)}
                        >
                            ${Icon(GLYPHS[shape])}
                        </button>`,
                )}
            </div>
            <div
                class="ui-choices articulations"
                role="radiogroup"
                aria-label="articulation"
                data-synth
            >
                ${ARTICULATIONS.map(
                    articulation =>
                        html`<button
                            class="ui-choice"
                            type="button"
                            role="radio"
                            data-articulation=${ifDefined(articulation)}
                            title=${ifDefined(
                                articulation === 'pluck'
                                    ? 'each new note strikes and fades'
                                    : 'one tone that follows the pitch',
                            )}
                        >
                            ${articulation}
                        </button>`,
                )}
            </div>
        </div>
        <div class="ui-choices instruments" role="radiogroup" aria-label="instrument">
            ${VOICE_INSTRUMENTS.map(
                instrument =>
                    html`<button
                        class="ui-choice"
                        type="button"
                        role="radio"
                        data-instrument=${ifDefined(instrument)}
                    >
                        ${instrument}
                    </button>`,
            )}
        </div>
        <div class="roll">
            <canvas width="600" height="240"></canvas><span class="cursor"></span
            ><span class="now"></span>
        </div>
        <p class="ui-hint hint">
            Plug a signal into <b>pitch</b> in the state menu or in state mode: its value is octaves
            above the root, snapped to the scale. A steps signal plays a melody.
        </p>
        <div class="settings">
            <label class="field"
                ><span>root</span
                ><hks-select class="ui-field" data-root
                    >${ROOT_NOTES.map(
                        note => html`<option .value=${note}>${noteName(note)}</option>`,
                    )}</hks-select
                ></label
            >
            <div class="ui-choices scales" role="radiogroup" aria-label="scale">
                ${SCALES.map(
                    scale =>
                        html`<button
                            class="ui-choice"
                            type="button"
                            role="radio"
                            data-scale=${ifDefined(scale)}
                        >
                            ${scale}
                        </button>`,
                )}
            </div>
            <label
                class="dial"
                data-only="pluck"
                data-synth
                title="how long a struck note takes to fade"
                ><span>decay</span
                ><input
                    class="ui-range"
                    type="range"
                    data-dial="decay"
                    min=${ifDefined(DECAY.low)}
                    max=${ifDefined(DECAY.high)}
                    step="0.01" /><output></output></label
            ><label class="dial" data-synth title="how long the pitch takes to slide to a new note"
                ><span>glide</span
                ><input
                    class="ui-range"
                    type="range"
                    data-dial="glide"
                    min=${ifDefined(GLIDE.low)}
                    max=${ifDefined(GLIDE.high)}
                    step="0.01" /><output></output></label
            ><label class="dial" title="how loud; a volume signal swells it"
                ><span>volume</span
                ><input
                    class="ui-range"
                    type="range"
                    data-dial="volume"
                    min="0"
                    max="1"
                    step="0.01" /><output></output
            ></label>
        </div>`;

const dataOf = (target: EventTarget | null, name: string) =>
    target instanceof Element
        ? (target.closest(`[data-${name}]`)?.getAttribute(`data-${name}`) ?? null)
        : null;

export type VoiceEvent =
    { readonly kind: 'command'; readonly command: VoiceCommand } | { readonly kind: 'listen' };

const rollRange = (notes: readonly Note[]) => {
    const heights = notes.map(({ semitones }) => semitones);
    const low = Math.min(0, ...heights);
    const high = Math.max(12, ...heights);

    return { low: low - 1, high: high + 1 };
};

const drawRoll = (canvas: HTMLCanvasElement, notes: readonly Note[], ink: string, rule: string) => {
    const context = canvas.getContext('2d');

    if (context === null) {
        return;
    }

    const { width, height } = canvas;
    const { low, high } = rollRange(notes);
    const row = height / (high - low);
    const yOf = (semitones: number) => height - (semitones - low) * row;

    context.clearRect(0, 0, width, height);
    context.fillStyle = rule;
    Array.from({ length: Math.floor(high / 12) - Math.ceil(low / 12) + 1 }, (_, index) => {
        context.fillRect(0, yOf((Math.ceil(low / 12) + index) * 12), width, 1);
    });
    context.fillStyle = ink;
    notes.forEach(({ from, to, semitones }) => {
        const bar = Math.max(2, row * 0.7);

        context.fillRect(
            from * width + 1,
            yOf(semitones) - bar / 2,
            Math.max(2, (to - from) * width - 2),
            bar,
        );
    });
};

export class HksVoice extends HTMLElement {
    readonly changes$: Observable<VoiceEvent>;

    private readonly shadow: ShadowRoot;

    private readonly rendering: Rendering;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        this.shadow = shadow;
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());

        // From the host, as what was really clicked: inside a shadow root the event is retargeted to it.
        const picked$ = fromElementEvent$(this, 'click').pipe(
            mergeMap((event): VoiceEvent[] => {
                const target = event.composedPath()[0] ?? null;
                const shape = dataOf(target, 'shape');
                const scale = dataOf(target, 'scale');
                const articulation = dataOf(target, 'articulation');
                const instrument = dataOf(target, 'instrument');
                const command = (made: VoiceCommand): VoiceEvent[] => [
                    { kind: 'command', command: made },
                ];

                return target instanceof Element && target.closest('.listen') !== null
                    ? [{ kind: 'listen' }]
                    : shape !== null && isShape(shape)
                      ? command({ kind: 'shape', shape })
                      : scale !== null && isScale(scale)
                        ? command({ kind: 'scale', scale })
                        : articulation !== null && isArticulation(articulation)
                          ? command({ kind: 'articulation', articulation })
                          : instrument !== null && isVoiceInstrument(instrument)
                            ? command({ kind: 'instrument', instrument })
                            : [];
            }),
        );

        const set$ = merge(
            fromElementEvent$(requireChild(shadow, '.settings'), 'input'),
            fromElementEvent$(requireChild(shadow, '.settings'), 'change').pipe(
                filter(({ target }) => target instanceof HksSelect),
            ),
        ).pipe(
            mergeMap(({ target }): VoiceEvent[] => {
                if (!(target instanceof HTMLInputElement || target instanceof HksSelect)) {
                    return [];
                }

                const value = Number(target.value);
                const dial = target.dataset['dial'];
                const command: VoiceCommand | null =
                    target.dataset['root'] !== undefined
                        ? { kind: 'root', root: value }
                        : dial === 'decay'
                          ? { kind: 'decay', decay: value }
                          : dial === 'glide'
                            ? { kind: 'glide', glide: value }
                            : dial === 'volume'
                              ? { kind: 'volume', volume: value }
                              : null;

                return command === null ? [] : [{ kind: 'command', command }];
            }),
        );

        this.changes$ = merge(picked$, set$);
    }

    connect$(
        heard$: Observable<Heard>,
        t$: Observable<number>,
        listening$: Observable<boolean>,
    ): Observable<void> {
        const shadow = this.shadow;
        const canvas = requireElement(shadow, '.roll canvas', HTMLCanvasElement);
        const cursor = requireChild(shadow, '.cursor');
        const now = requireChild(shadow, '.now');
        const hint = requireChild(shadow, '.hint');
        const listen = requireChild(shadow, '.listen');
        const root = requireElement(shadow, '[data-root]', HksSelect);
        const token = (name: string) =>
            getComputedStyle(this).getPropertyValue(name).trim() || '#000000';

        const checked = (name: string, value: string) => {
            for (const button of shadow.querySelectorAll(`[data-${name}]`)) {
                button.setAttribute(
                    'aria-checked',
                    String(button.getAttribute(`data-${name}`) === value),
                );
            }
        };

        const dialed = (name: string, value: number, shown: string) => {
            const input = requireElement(shadow, `[data-dial="${name}"]`, HTMLInputElement);

            if (input.value !== String(value)) {
                input.value = String(value);
            }

            const output = input.parentElement?.querySelector('output');

            if (output) {
                output.textContent = shown;
            }
        };

        const controls$ = heard$.pipe(
            map(({ sounding }) => sounding),
            distinctUntilChanged((a, b) => a.voice === b.voice && a.waves.pitch === b.waves.pitch),
            tap(({ voice, waves }) => {
                checked('shape', voice.shape);
                checked('instrument', voice.instrument);
                this.dataset['instrument'] = voice.instrument;
                checked('scale', voice.scale);
                checked('articulation', voice.articulation);
                if (root.value !== String(voice.root)) {
                    root.value = String(voice.root);
                }
                dialed('decay', voice.decay, `${voice.decay.toFixed(2)} s`);
                dialed('glide', voice.glide, `${voice.glide.toFixed(2)} s`);
                dialed('volume', voice.volume, `${Math.round(voice.volume * 100)}%`);
                this.dataset['articulation'] = voice.articulation;
                hint.hidden = waves.pitch !== null;
            }),
        );

        const roll$ = heard$.pipe(
            map(({ notes }) => notes),
            distinctUntilChanged(),
            tap(notes => {
                drawRoll(canvas, notes, token('--ink'), token('--edge'));
            }),
        );

        const moment$ = combineLatest([heard$, t$]).pipe(
            map(([{ sounding }, t]) => ({
                t,
                name: noteName(sounding.voice.root + semitonesAt(sounding, t)),
            })),
            tap(({ t, name }) => {
                cursor.style.setProperty('--t', String(((t % 1) + 1) % 1));
                if (now.textContent !== name) {
                    now.textContent = name;
                }
            }),
        );

        const listened$ = listening$.pipe(
            distinctUntilChanged(),
            tap(on => {
                listen.setAttribute('aria-pressed', String(on));
            }),
        );

        return merge(
            this.rendering.lifetime$,
            connectChoices$(this.shadow),
            merge(connectSelects$(this.shadow), controls$, roll$, moment$, listened$).pipe(
                map(() => undefined),
            ),
        );
    }
}

customElements.define('hks-voice', HksVoice);
