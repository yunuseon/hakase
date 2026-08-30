import { animationFrameScheduler, type Observable } from 'rxjs';
import { bufferTime, map, tap } from 'rxjs/operators';
import { styleSheet } from '../../lib/dom.ts';
import css from './fps-counter.css?inline';

const sheet = styleSheet(css);

export class HksFpsCounter extends HTMLElement {
    private readonly readout: ShadowRoot;

    constructor() {
        super();

        this.readout = this.attachShadow({ mode: 'open' });
        this.readout.adoptedStyleSheets = [sheet];
    }

    connect$(frames$: Observable<unknown>): Observable<void> {
        return frames$.pipe(
            bufferTime(1000, animationFrameScheduler),
            map(frames => `${frames.length} fps`),
            tap(text => {
                this.readout.textContent = text;
            }),
            map(() => undefined),
        );
    }
}

customElements.define('hks-fps-counter', HksFpsCounter);
