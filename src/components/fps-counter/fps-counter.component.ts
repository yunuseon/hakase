import { renderView, type RenderView } from '../../lib/lit.ts';
import { controlsSheet } from '../../shared/ui/controls.component.ts';
import { animationFrameScheduler, merge, type Observable } from 'rxjs';
import { bufferTime, map, tap } from 'rxjs/operators';
import { styleSheet } from '../../lib/dom.ts';
import css from './fps-counter.css?inline';

const sheet = styleSheet(css);

export class HksFpsCounter extends HTMLElement {
    private readonly rendering: RenderView<string>;

    constructor() {
        super();

        const root = this.attachShadow({ mode: 'open' });
        root.adoptedStyleSheets = [controlsSheet, sheet];
        this.rendering = renderView(root, '0 fps', value => value);
    }

    connect$(frames$: Observable<unknown>): Observable<void> {
        return merge(
            this.rendering.lifetime$,
            frames$.pipe(
                bufferTime(1000, animationFrameScheduler),
                map(frames => `${frames.length} fps`),
                tap(text => {
                    this.rendering.update(text);
                }),
            ),
        ).pipe(map(() => undefined));
    }
}

customElements.define('hks-fps-counter', HksFpsCounter);
