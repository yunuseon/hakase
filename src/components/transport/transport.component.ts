import { merge, type Observable } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { requireChild, requireElement, styleSheet } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import type { TransportCommand } from '../../shared/playhead.ts';
import css from './transport.css?inline';

const sheet = styleSheet(css);

const PLAY = 'M3 2 L10 6 L3 10 Z';
const PAUSE = 'M3 2 H5 V10 H3 Z M7 2 H9 V10 H7 Z';

const TEMPLATE = `
    <button class="key toggle" type="button" aria-label="play">
        <svg viewBox="0 0 12 12" aria-hidden="true"><path class="glyph" d="${PLAY}"/></svg>
    </button>
    <button class="key stop" type="button" aria-label="stop">
        <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="2.5" width="7" height="7"/></svg>
    </button>
    <span class="clock"></span>
`;

export class HksTransport extends HTMLElement {
    readonly commands$: Observable<TransportCommand>;

    private readonly toggle: HTMLElement;
    private readonly glyph: SVGPathElement;
    private readonly clock: HTMLElement;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        shadow.innerHTML = TEMPLATE;

        this.toggle = requireChild(shadow, '.toggle');
        this.glyph = requireElement(shadow, '.glyph', SVGPathElement);
        this.clock = requireChild(shadow, '.clock');

        this.commands$ = merge(
            fromElementEvent$(this.toggle, 'click').pipe(map((): TransportCommand => 'toggle')),
            fromElementEvent$(requireChild(shadow, '.stop'), 'click').pipe(
                map((): TransportCommand => 'stop'),
            ),
        );
    }

    connect$(playing$: Observable<boolean>, clock$: Observable<string>): Observable<void> {
        return merge(
            playing$.pipe(
                distinctUntilChanged(),
                tap(playing => {
                    this.glyph.setAttribute('d', playing ? PAUSE : PLAY);
                    this.toggle.setAttribute('aria-label', playing ? 'pause' : 'play');
                }),
            ),
            clock$.pipe(
                distinctUntilChanged(),
                tap(label => {
                    this.clock.textContent = label;
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-transport', HksTransport);
