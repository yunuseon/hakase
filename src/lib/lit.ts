import { nothing, render, type RenderRootNode } from 'lit-html';
import { NEVER, type Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

export type Rendering = { readonly lifetime$: Observable<never> };
export type RenderView<T> = Rendering & { readonly update: (value: T) => void };

const mounted = (root: RenderRootNode, initial: unknown): RenderView<unknown> => {
    const part = render(initial, root);
    const lifetime = new AbortController();
    customElements.upgrade(root);
    return {
        lifetime$: NEVER.pipe(
            finalize(() => {
                lifetime.abort();
                part.setConnected(false);
                render(nothing, root);
            }),
        ),
        update: template => {
            if (!lifetime.signal.aborted) {
                render(template, root);
                customElements.upgrade(root);
            }
        },
    };
};

export const mountView = (root: RenderRootNode, template: () => unknown): Rendering =>
    mounted(root, template());

export const renderView = <T>(
    root: RenderRootNode,
    initial: T,
    template: (view: T) => unknown,
): RenderView<T> => {
    const rendering = mounted(root, template(initial));
    return { lifetime$: rendering.lifetime$, update: value => rendering.update(template(value)) };
};

export const withValue = <T>(
    value: T,
    template: (value: NonNullable<T>) => unknown,
    fallback: unknown = nothing,
): unknown => (value ? template(value) : fallback);

export const displayValue = (
    element: HTMLInputElement | HTMLTextAreaElement,
    text: string,
): void => {
    const root = element.getRootNode();
    const focused =
        (root instanceof ShadowRoot || root instanceof Document) && root.activeElement === element;
    if (!focused && element.value !== text) {
        element.value = text;
    }
};
