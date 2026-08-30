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

export const styleSheet = (css: string): CSSStyleSheet => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);

    return sheet;
};

export const isTextEntry = (event: KeyboardEvent): boolean =>
    event
        .composedPath()
        .some(
            target => target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement,
        );

export type Viewport = {
    readonly width: number;
    readonly height: number;
};

// `innerWidth` reads 0 in an embedded frame before layout; floor it once, here.
export const viewportSize = (): Viewport => ({
    width: Math.max(window.innerWidth, 960),
    height: Math.max(window.innerHeight, 600),
});
