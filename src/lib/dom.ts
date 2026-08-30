export const requireElement = <T extends Element>(
    parent: ParentNode,
    selector: string,
    kind: new () => T,
): T => {
    const element = parent.querySelector(selector);
    if (!(element instanceof kind)) {
        throw new Error(`Expected "${selector}" to be a ${kind.name}`);
    }

    return element;
};

export const requireChild = (parent: ParentNode, selector: string): HTMLElement =>
    requireElement(parent, selector, HTMLElement);

export const styleSheet = (css: string): CSSStyleSheet => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);

    return sheet;
};

export type Viewport = {
    readonly width: number;
    readonly height: number;
};

// `innerWidth` reads 0 in an embedded frame before layout; floor it once, here.
export const viewportSize = (): Viewport => ({
    width: Math.max(window.innerWidth, 960),
    height: Math.max(window.innerHeight, 600),
});
