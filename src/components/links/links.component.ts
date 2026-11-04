import type { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { styleSheet } from '../../lib/dom.ts';
import { linkPath, type LinkView } from './links.ts';
import css from './links.css?inline';

const sheet = styleSheet(css);
const SVG = 'http://www.w3.org/2000/svg';

export class HksLinks extends HTMLElement {
    private readonly svg: SVGSVGElement;

    constructor() {
        super();

        const shadow = this.attachShadow({ mode: 'open' });
        shadow.adoptedStyleSheets = [sheet];
        this.svg = document.createElementNS(SVG, 'svg');
        this.svg.setAttribute('aria-hidden', 'true');
        shadow.append(this.svg);
    }

    connect$(links$: Observable<readonly LinkView[]>): Observable<void> {
        return links$.pipe(
            tap(links => {
                this.svg.replaceChildren(
                    ...links.map(({ from, to, kind, colour }) => {
                        const path = document.createElementNS(SVG, 'path');
                        path.classList.add('link');
                        path.dataset['kind'] = kind;
                        path.setAttribute('d', linkPath(from, to));
                        path.style.setProperty('--store', colour);

                        return path;
                    }),
                );
            }),
            map(() => undefined),
        );
    }
}

customElements.define('hks-links', HksLinks);
