import { controlsSheet } from '../../../shared/ui/controls.component.ts';
import { html } from 'lit-html';
import { mountView, type Rendering } from '../../../lib/lit.ts';
import { combineLatest, merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../../lib/dom.ts';
import { observeResize$ } from '../../../lib/rx.ts';
import { angularValue, ringOffset, type Point, type Ring } from '../slider.ts';
import { pointerGesture$ } from '../../../shared/drag.ts';
import type { Slider } from '../slider.ts';
import type { Scrub } from '../../../shared/playhead.ts';
import css from './circular-slider.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = () =>
    html`<div
        class="track"
        role="slider"
        aria-label="Playback position"
        aria-valuemin="0"
        aria-valuemax="100"
    >
        <div class="indicator"></div>
    </div>`;

const indicatorTransform = ({ x, y }: Point): string =>
    `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;

export class HksCircularSlider extends HTMLElement implements Slider {
    readonly changes$: Observable<Scrub>;

    private readonly track: HTMLElement;
    private readonly indicator: HTMLElement;
    private readonly ring$: Observable<Ring>;

    private readonly rendering: Rendering;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = mountView(shadow, () => TEMPLATE());

        this.track = requireChild(shadow, '.track');
        this.indicator = requireChild(shadow, '.indicator');

        this.ring$ = observeResize$(this.track, this.indicator).pipe(
            map(() => ({
                trackRadiusX: this.track.offsetWidth / 2,
                trackRadiusY: this.track.offsetHeight / 2,
                indicatorRadiusX: this.indicator.offsetWidth / 2,
                indicatorRadiusY: this.indicator.offsetHeight / 2,
            })),
        );

        this.changes$ = pointerGesture$(this.track).pipe(
            map(({ phase, event: { clientX, clientY } }) => {
                const { left, top, width, height } = this.track.getBoundingClientRect();
                return {
                    phase,
                    at: angularValue(clientX - (left + width / 2), clientY - (top + height / 2)),
                };
            }),
        );
    }

    connect$(at$: Observable<number>): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            merge(
                at$.pipe(
                    map(at => String(Math.round(at * 100))),
                    distinctUntilChanged(),
                    tap(value => {
                        this.track.setAttribute('aria-valuenow', value);
                    }),
                ),
                combineLatest([this.ring$, at$]).pipe(
                    map(([ring, at]) => indicatorTransform(ringOffset(ring, at))),
                    distinctUntilChanged(),
                    tap(transform => {
                        this.indicator.style.transform = transform;
                    }),
                ),
            ).pipe(map(() => undefined)),
        );
    }
}

customElements.define('hks-circular-slider', HksCircularSlider);
