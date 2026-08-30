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

export const requireTextArea = (id: string): HTMLTextAreaElement => {
    const element = requireElementById(id);
    if (!(element instanceof HTMLTextAreaElement)) {
        throw new Error(`Expected the element with id "${id}" to be a <textarea>`);
    }

    return element;
};

export const requireElement = <T extends HTMLElement>(
    parent: ParentNode,
    selector: string,
    kind: new () => T,
): T => {
    const element = parent.querySelector(selector);
    if (!(element instanceof kind)) {
        throw new Error(`Expected "${selector}" to be an upgraded ${kind.name}`);
    }

    return element;
};

/** Built once per component module and shared by every instance of it. */
export const styleSheet = (css: string): CSSStyleSheet => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);

    return sheet;
};
