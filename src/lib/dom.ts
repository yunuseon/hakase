export const requireElementById = (id: string): HTMLElement => {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`Expected an element with id "${id}" in the document`);
    }

    return element;
};

export const requireChild = (parent: ParentNode, selector: string): HTMLElement => {
    const element = parent.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
        throw new Error(`Expected an HTMLElement matching "${selector}"`);
    }

    return element;
};
