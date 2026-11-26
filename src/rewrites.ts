import type { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { rewritesOf, type Write } from './diagnostics.ts';
import { mutations$ } from './lib/rx.ts';

export type Rewrite = {
    readonly window: string;
    readonly at: string;
    readonly name: string;
    readonly values: readonly (string | null)[];
};

const writeOf = (record: MutationRecord): readonly Write<Node>[] =>
    record.type === 'attributes' && record.attributeName !== null
        ? [{ target: record.target, name: record.attributeName, old: record.oldValue }]
        : record.type === 'characterData'
          ? [{ target: record.target, name: '#text', old: record.oldValue }]
          : [];

const valueOf = (target: Node, name: string): string | null =>
    name === '#text'
        ? target.textContent
        : target instanceof Element
          ? target.getAttribute(name)
          : null;

const elementOf = (node: Node): Element | null =>
    node instanceof Element ? node : node.parentElement;

const windowOf = (node: Node): string => {
    const element = elementOf(node);
    const window = element?.closest('hks-window');
    const root = node.getRootNode();

    return window instanceof HTMLElement
        ? (window.dataset['process'] ?? 'window')
        : root instanceof ShadowRoot
          ? windowOf(root.host)
          : 'chrome';
};

const named = (element: Element): string =>
    `${element.localName}${element.classList.length > 0 ? `.${[...element.classList].join('.')}` : ''}`;

const placeOf = (node: Node): string => {
    const element = elementOf(node);
    const root = node.getRootNode();
    const host = root instanceof ShadowRoot ? root.host.localName : '';

    return [
        host,
        element?.parentElement ? named(element.parentElement) : '',
        element ? named(element) : '',
    ]
        .filter(part => part !== '')
        .join(' > ');
};

export const rewrites$ = (root: Node): Observable<Rewrite> =>
    mutations$(root).pipe(
        mergeMap(records =>
            rewritesOf(records.flatMap(writeOf)).map(({ target, name, olds }) => ({
                window: windowOf(target),
                at: placeOf(target),
                name,
                values: [...olds, valueOf(target, name)],
            })),
        ),
    );
