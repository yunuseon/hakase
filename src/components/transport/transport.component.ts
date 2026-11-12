import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';
import { mountView, type Rendering } from '../../lib/lit.ts';
import { EMPTY, merge, of, type Observable } from 'rxjs';
import { distinctUntilChanged, map, mergeMap, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { parseDuration, type TransportCommand } from '../../shared/playhead.ts';
import css from './transport.css?inline';

const sheet = styleSheet(css);

const PLAY = 'M3 2 L10 6 L3 10 Z';
const PAUSE = 'M3 2 H5 V10 H3 Z M7 2 H9 V10 H7 Z';

const TEMPLATE = () =>
    html`<button class="toggle" type="button" aria-label="play">
            <svg viewBox="0 0 12 12" aria-hidden="true">
                <path class="glyph" d=${ifDefined(PLAY)}></path>
            </svg></button
        ><button class="ui-icon stop" type="button" aria-label="stop" title="stop">
            <svg viewBox="0 0 12 12" aria-hidden="true">
                <rect x="2.5" y="2.5" width="7" height="7" rx="1"></rect>
            </svg></button
        ><button
            class="ui-icon loop"
            type="button"
            aria-label="loop"
            title="loop"
            aria-pressed="true"
        >
            <svg viewBox="0 0 12 12" aria-hidden="true">
                <path class="ring" d="M9.5 4.5 A4 4 0 1 0 10 7"></path>
                <path d="M7.5 2.5 L10 4.8 L10.6 1.6 Z"></path>
            </svg></button
        ><button
            class="ui-icon day"
            type="button"
            aria-label="run on the time of day"
            title="run on the time of day: the loop is today, and it cannot be played or scrubbed"
            aria-pressed="false"
        >
            <svg viewBox="0 0 12 12" aria-hidden="true">
                <circle cx="6" cy="6" r="2.2"></circle>
                <path
                    class="ring"
                    d="M6 1 V2.2 M6 9.8 V11 M1 6 H2.2 M9.8 6 H11 M2.5 2.5 L3.3 3.3 M8.7 8.7 L9.5 9.5 M2.5 9.5 L3.3 8.7 M8.7 3.3 L9.5 2.5"
                ></path>
            </svg></button
        ><span class="time"
            ><span class="clock"></span><span class="of">/</span><span class="whole-day">24 h</span
            ><label class="field length" title="loop length in seconds"
                ><input
                    class="duration"
                    type="number"
                    min="0.1"
                    max="600"
                    step="0.1"
                    aria-label="duration in seconds"
                /><span>s</span></label
            ><label
                class="field"
                title="logic ticks per loop: how many times a circuit steps in one loop"
                ><input
                    class="ticks"
                    type="number"
                    min="1"
                    max="64"
                    step="1"
                    aria-label="logic ticks per loop"
                /><span>ticks</span></label
            ></span
        >`;

export class HksTransport extends HTMLElement {
    readonly commands$: Observable<TransportCommand>;
    readonly durations$: Observable<number>;
    readonly ticks$: Observable<number>;
    readonly days$: Observable<void>;

    private readonly toggle: HTMLButtonElement;
    private readonly glyph: SVGPathElement;
    private readonly loop: HTMLButtonElement;
    private readonly stop: HTMLButtonElement;
    private readonly day: HTMLElement;
    private readonly clock: HTMLElement;
    private readonly duration: HTMLInputElement;
    private readonly ticks: HTMLInputElement;

    private readonly rendering: Rendering;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());

        this.toggle = requireElement(shadow, '.toggle', HTMLButtonElement);
        this.stop = requireElement(shadow, '.stop', HTMLButtonElement);
        this.day = requireChild(shadow, '.day');
        this.glyph = requireElement(shadow, '.glyph', SVGPathElement);
        this.loop = requireElement(shadow, '.loop', HTMLButtonElement);
        this.clock = requireChild(shadow, '.clock');
        this.duration = requireElement(shadow, '.duration', HTMLInputElement);
        this.ticks = requireElement(shadow, '.ticks', HTMLInputElement);

        this.commands$ = merge(
            fromElementEvent$(this.toggle, 'click').pipe(map((): TransportCommand => 'toggle')),
            fromElementEvent$(this.stop, 'click').pipe(map((): TransportCommand => 'stop')),
            fromElementEvent$(this.loop, 'click').pipe(map((): TransportCommand => 'loop')),
        );

        this.days$ = fromElementEvent$(this.day, 'click').pipe(map(() => undefined));

        // change, not input: input fires per keystroke, and "1" would apply on the way to "12".
        this.durations$ = fromElementEvent$(this.duration, 'change').pipe(
            mergeMap(() => {
                const seconds = parseDuration(this.duration.value);

                return seconds === null ? EMPTY : of(seconds);
            }),
        );

        this.ticks$ = fromElementEvent$(this.ticks, 'change').pipe(
            mergeMap(() => {
                const count = this.ticks.valueAsNumber;

                return Number.isFinite(count) ? of(count) : EMPTY;
            }),
        );
    }

    connect$(
        playing$: Observable<boolean>,
        looping$: Observable<boolean>,
        clock$: Observable<string>,
        duration$: Observable<number>,
        ticks$: Observable<number> = EMPTY,
        day$: Observable<boolean> = EMPTY,
    ): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            merge(
                playing$.pipe(
                    distinctUntilChanged(),
                    tap(playing => {
                        this.glyph.setAttribute('d', playing ? PAUSE : PLAY);
                        this.toggle.setAttribute('aria-label', playing ? 'pause' : 'play');
                    }),
                ),
                looping$.pipe(
                    map(looping => String(looping)),
                    distinctUntilChanged(),
                    tap(pressed => {
                        this.loop.setAttribute('aria-pressed', pressed);
                    }),
                ),
                clock$.pipe(
                    distinctUntilChanged(),
                    tap(label => {
                        this.clock.textContent = label;
                    }),
                ),
                duration$.pipe(
                    map(seconds => String(seconds)),
                    distinctUntilChanged(),
                    tap(text => {
                        this.duration.value = text;
                    }),
                ),
                day$.pipe(
                    distinctUntilChanged(),
                    tap(day => {
                        this.toggleAttribute('data-day', day);
                        this.day.setAttribute('aria-pressed', String(day));
                        this.toggle.disabled = day;
                        this.stop.disabled = day;
                        this.loop.disabled = day;
                    }),
                ),
                ticks$.pipe(
                    map(count => String(count)),
                    distinctUntilChanged(),
                    tap(text => {
                        this.ticks.value = text;
                    }),
                ),
            ).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-transport', HksTransport);
