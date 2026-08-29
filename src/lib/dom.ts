/**
 * Look up an element by id and narrow it to the expected type, throwing a
 * useful error instead of leaking `null` into the rest of the app.
 */
export const requireElementById = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Expected an element with id "${id}" in the document`);
    }

    return element as T;
};

export const requireChild = <T extends HTMLElement = HTMLElement>(
    parent: ParentNode,
    selector: string,
): T => {
    const element = parent.querySelector<T>(selector);
    if (!element) {
        throw new Error(`Expected a descendant matching "${selector}"`);
    }

    return element;
};
