import { combineLatest, merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../../lib/dom.ts';
import { observeResize$ } from '../../../lib/rx.ts';
import { angularValue, ringOffset, type Point, type Ring, type Progress } from '../slider.ts';
import { pointerGesture$ } from '../../../shared/drag.ts';
import type { Slider } from '../slider.ts';
import type { Scrub } from '../../../shared/playhead.ts';
import css from './circular-slider.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <div class="track"><div class="indicator"></div></div>
    <span class="hint" hidden>Read only</span>
`;

const indicatorTransform = ({ x, y }: Point): string =>
    `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;

export class HksCircularSlider extends HTMLElement implements Slider {
    readonly changes$: Observable<Scrub>;

    private readonly track: HTMLElement;
    private readonly indicator: HTMLElement;
    private readonly ring$: Observable<Ring>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

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

    connect$(progress$: Observable<Progress>): Observable<void> {
        return merge(
            progress$.pipe(
                map(({ access }) => access === 'read'),
                distinctUntilChanged(),
                tap(readonly => {
                    this.toggleAttribute('data-readonly', readonly);
                    this.track.setAttribute('role', readonly ? 'progressbar' : 'slider');
                    this.track.setAttribute(
                        'aria-label',
                        readonly ? 'Phase progress, read only' : 'Playback position',
                    );
                    requireChild(this.shadowRoot ?? this, '.hint').hidden = !readonly;
                }),
            ),
            progress$.pipe(
                map(({ at }) => String(Math.round(at * 100))),
                distinctUntilChanged(),
                tap(value => {
                    this.track.setAttribute('aria-valuenow', value);
                    this.track.setAttribute('aria-valuemin', '0');
                    this.track.setAttribute('aria-valuemax', '100');
                }),
            ),
            combineLatest([this.ring$, progress$]).pipe(
                map(([ring, { at }]) => indicatorTransform(ringOffset(ring, at))),
                distinctUntilChanged(),
                tap(transform => {
                    this.indicator.style.transform = transform;
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-circular-slider', HksCircularSlider);
