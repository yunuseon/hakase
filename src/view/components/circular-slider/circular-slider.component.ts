import { combineLatest, merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../../lib/dom.ts';
import windowCss from '../window.css?inline';
import { observeResize$ } from '../../../lib/rx.ts';
import { angularValue, ringOffset, type Point, type Ring } from '../../../model/slider.ts';
import { pointerDrag$ } from '../../drag.ts';
import type { Frame, LayoutAction } from '../../../model/layout.ts';
import type { Slider } from '../slider.ts';
import { frameActions$, place, size } from '../window-frame.ts';
import css from './circular-slider.css?inline';

const chrome = styleSheet(windowCss);
const sheet = styleSheet(css);

const TEMPLATE = `
    <div class="title"><span>playhead</span></div>
    <div class="body"><div class="track"><div class="indicator"></div></div></div>
`;

const indicatorTransform = ({ x, y }: Point): string =>
    `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;

export class HksCircularSlider extends HTMLElement implements Slider {
    readonly changes$: Observable<number>;
    readonly frame$: Observable<LayoutAction>;

    private readonly track: HTMLElement;
    private readonly indicator: HTMLElement;
    private readonly ring$: Observable<Ring>;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [chrome, sheet];
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

        this.frame$ = frameActions$(this, shadow, 'playhead');

        this.changes$ = pointerDrag$(this.track).pipe(
            map(({ clientX, clientY }) => {
                const { left, top, width, height } = this.track.getBoundingClientRect();
                return angularValue(clientX - (left + width / 2), clientY - (top + height / 2));
            }),
        );
    }

    connect$(playhead$: Observable<number>, frame$: Observable<Frame>): Observable<void> {
        return merge(
            frame$.pipe(
                tap(frame => {
                    place(this, frame);
                    size(this, frame);
                }),
            ),
            combineLatest([this.ring$, playhead$]).pipe(
                map(([ring, value]) => indicatorTransform(ringOffset(ring, value))),
                distinctUntilChanged(),
                tap(transform => {
                    this.indicator.style.transform = transform;
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-circular-slider', HksCircularSlider);
