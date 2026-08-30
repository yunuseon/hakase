import { merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../../lib/dom.ts';
import type { Frame, LayoutAction } from '../../../model/layout.ts';
import { linearValue } from '../../../model/slider.ts';
import { pointerDrag$ } from '../../drag.ts';
import type { Slider } from '../slider.ts';
import { frameActions$, place, size } from '../window-frame.ts';
import windowCss from '../window.css?inline';
import css from './linear-slider.css?inline';

const chrome = styleSheet(windowCss);
const sheet = styleSheet(css);

const TEMPLATE = `
    <div class="title"><span>timeline</span></div>
    <div class="body"><div class="track"><div class="indicator"></div></div></div>
`;

const indicatorWidth = (value: number): string => `${(value * 100).toFixed(3)}%`;

export class HksLinearSlider extends HTMLElement implements Slider {
    readonly changes$: Observable<number>;
    readonly frame$: Observable<LayoutAction>;

    private readonly track: HTMLElement;
    private readonly indicator: HTMLElement;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [chrome, sheet];
        shadow.innerHTML = TEMPLATE;

        this.track = requireChild(shadow, '.track');
        this.indicator = requireChild(shadow, '.indicator');

        this.frame$ = frameActions$(this, shadow, 'timeline');

        this.changes$ = pointerDrag$(this.track).pipe(
            map(({ clientX }) => {
                const { left, width } = this.track.getBoundingClientRect();
                return linearValue(clientX - left, width);
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
            playhead$.pipe(
                map(indicatorWidth),
                distinctUntilChanged(),
                tap(width => {
                    this.indicator.style.width = width;
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-linear-slider', HksLinearSlider);
