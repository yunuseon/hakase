export const SIZE_CLASSES = ['glance', 'compact', 'regular', 'wide'] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number];

export const BREAKPOINTS = { glanceWidth: 13, glanceHeight: 9, compact: 22, wide: 40 } as const;

export const WINDOW_CHROME = { strip: 2.25, padding: 0.5 } as const;

type Extent = { readonly width: number; readonly height: number };

export const bodyOf = ({ width, height }: Extent, rem = 16): Extent => ({
    width: width - 2 * WINDOW_CHROME.padding * rem,
    height: height - (WINDOW_CHROME.strip + WINDOW_CHROME.padding) * rem,
});

export const sizeClassOf = (frame: Extent, rem = 16): SizeClass => {
    const { width, height } = bodyOf(frame, rem);

    return width < BREAKPOINTS.glanceWidth * rem || height < BREAKPOINTS.glanceHeight * rem
        ? 'glance'
        : width < BREAKPOINTS.compact * rem
          ? 'compact'
          : width < BREAKPOINTS.wide * rem
            ? 'regular'
            : 'wide';
};
