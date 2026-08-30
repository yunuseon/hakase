import { merge, type Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { requireChild } from '../../lib/dom.ts';
import { fromElementEvent$ } from '../../lib/rx.ts';
import {
    RESIZE_EDGES,
    type Frame,
    type LayoutAction,
    type Placement,
    type ResizeEdge,
    type WindowId,
} from '../../model/layout.ts';
import { pointerDelta$ } from '../drag.ts';

const addHandles = (shadow: ShadowRoot): void => {
    for (const edge of RESIZE_EDGES) {
        const handle = document.createElement('div');
        handle.className = `handle handle--${edge}`;
        shadow.appendChild(handle);
    }
};

const resizeFrom = (shadow: ShadowRoot, id: WindowId, edge: ResizeEdge): Observable<LayoutAction> =>
    pointerDelta$(requireChild(shadow, `.handle--${edge}`)).pipe(
        map(({ dx, dy }): LayoutAction => ({ kind: 'resize', id, edge, dx, dy })),
    );

export const frameActions$ = (
    host: HTMLElement,
    shadow: ShadowRoot,
    id: WindowId,
): Observable<LayoutAction> => {
    addHandles(shadow);

    return merge(
        pointerDelta$(requireChild(shadow, '.title')).pipe(
            map(({ dx, dy }): LayoutAction => ({ kind: 'move', id, dx, dy })),
        ),
        ...RESIZE_EDGES.map(edge => resizeFrom(shadow, id, edge)),
        fromElementEvent$(host, 'pointerdown').pipe(
            map((): LayoutAction => ({ kind: 'raise', id })),
        ),
    );
};

export const place = (host: HTMLElement, { x, y, z }: Placement): void => {
    host.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
    host.style.zIndex = z.toFixed(0);
};

export const size = (host: HTMLElement, frame: Frame): void => {
    host.style.width = `${frame.width.toFixed(0)}px`;
    host.style.height = `${frame.height.toFixed(0)}px`;
};
