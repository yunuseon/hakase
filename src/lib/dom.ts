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

export const remScale = (): number =>
    parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;

export const MINIMUM_VIEWPORT = { width: 360, height: 640 } as const satisfies Viewport;

// `innerWidth` reads 0 in an embedded frame before layout; only that is replaced, not a small screen.
export const viewportSize = (): Viewport => ({
    width: window.innerWidth > 0 ? window.innerWidth : 960,
    height: window.innerHeight > 0 ? window.innerHeight : 600,
});

export const visibleViewport = () => ({
    left: window.visualViewport?.offsetLeft ?? 0,
    top: window.visualViewport?.offsetTop ?? 0,
    width: window.visualViewport?.width || viewportSize().width,
    height: window.visualViewport?.height || viewportSize().height,
    layoutHeight: viewportSize().height,
});

// A download the user asked for: an object URL clicked through a detached link, then released.
export const saveFile = (blob: Blob, name: string): void => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
};
