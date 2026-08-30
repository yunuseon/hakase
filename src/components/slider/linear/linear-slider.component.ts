import { merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { requireChild, styleSheet } from '../../../lib/dom.ts';
import { linearValue } from '../slider.ts';
import { pointerDrag$ } from '../../../shared/drag.ts';
import type { Slider } from '../slider.ts';
import css from './linear-slider.css?inline';

const sheet = styleSheet(css);

const TEMPLATE = `
    <div class="track"><div class="indicator"></div></div>
`;

const indicatorWidth = (value: number): string => `${(value * 100).toFixed(3)}%`;

export class HksLinearSlider extends HTMLElement implements Slider {
    readonly changes$: Observable<number>;

    private readonly track: HTMLElement;
    private readonly indicator: HTMLElement;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.track = requireChild(shadow, '.track');
        this.indicator = requireChild(shadow, '.indicator');

        this.changes$ = pointerDrag$(this.track).pipe(
            map(({ clientX }) => {
                const { left, width } = this.track.getBoundingClientRect();
                return linearValue(clientX - left, width);
            }),
        );
    }

    connect$(playhead$: Observable<number>): Observable<void> {
        return merge(
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
