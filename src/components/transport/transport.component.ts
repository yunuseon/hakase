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
    html`<button class="key toggle" type="button" aria-label="play">
            <svg viewBox="0 0 12 12" aria-hidden="true">
                <path class="glyph" d=${ifDefined(PLAY)}></path>
            </svg></button
        ><button class="key stop" type="button" aria-label="stop">
            <svg viewBox="0 0 12 12" aria-hidden="true">
                <rect x="2.5" y="2.5" width="7" height="7"></rect>
            </svg></button
        ><button class="key loop" type="button" aria-label="loop" aria-pressed="true">
            <svg viewBox="0 0 12 12" aria-hidden="true">
                <path class="ring" d="M9.5 4.5 A4 4 0 1 0 10 7"></path>
                <path d="M7.5 2.5 L10 4.8 L10.6 1.6 Z"></path>
            </svg></button
        ><span class="clock"></span><span class="of">/</span
        ><input
            class="ui-field duration"
            type="number"
            min="0.1"
            max="600"
            step="0.1"
            aria-label="duration in seconds"
        /><span class="unit">s</span>`;

export class HksTransport extends HTMLElement {
    readonly commands$: Observable<TransportCommand>;
    readonly durations$: Observable<number>;

    private readonly toggle: HTMLElement;
    private readonly glyph: SVGPathElement;
    private readonly loop: HTMLElement;
    private readonly clock: HTMLElement;
    private readonly duration: HTMLInputElement;

    private readonly rendering: Rendering;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());

        this.toggle = requireChild(shadow, '.toggle');
        this.glyph = requireElement(shadow, '.glyph', SVGPathElement);
        this.loop = requireChild(shadow, '.loop');
        this.clock = requireChild(shadow, '.clock');
        this.duration = requireElement(shadow, '.duration', HTMLInputElement);

        this.commands$ = merge(
            fromElementEvent$(this.toggle, 'click').pipe(map((): TransportCommand => 'toggle')),
            fromElementEvent$(requireChild(shadow, '.stop'), 'click').pipe(
                map((): TransportCommand => 'stop'),
            ),
            fromElementEvent$(this.loop, 'click').pipe(map((): TransportCommand => 'loop')),
        );

        // change, not input: input fires per keystroke, and "1" would apply on the way to "12".
        this.durations$ = fromElementEvent$(this.duration, 'change').pipe(
            mergeMap(() => {
                const seconds = parseDuration(this.duration.value);

                return seconds === null ? EMPTY : of(seconds);
            }),
        );
    }

    connect$(
        playing$: Observable<boolean>,
        looping$: Observable<boolean>,
        clock$: Observable<string>,
        duration$: Observable<number>,
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
            ).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-transport', HksTransport);
