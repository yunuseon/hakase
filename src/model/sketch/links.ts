import { DRIVES } from './params.ts';

export const SKETCH_PARAMS = [...DRIVES, 'paint'] as const;
export type SketchParam = (typeof SKETCH_PARAMS)[number];

export const isSketchParam = (value: string): value is SketchParam =>
    SKETCH_PARAMS.some(param => param === value);

export type SketchLink = { readonly sources: Readonly<Record<SketchParam, string | null>> };

export const unlinkedSketch: SketchLink = {
    sources: {
        k1: null,
        k2: null,
        k3: null,
        k4: null,
        turn: null,
        pitch: null,
        distance: null,
        focus: null,
        colour: null,
        size: null,
        depth: null,
        trails: null,
        paint: null,
    },
};

export const linkedSketch = (
    link: SketchLink,
    param: SketchParam,
    source: string | null,
): SketchLink =>
    link.sources[param] === source ? link : { sources: { ...link.sources, [param]: source } };

export const isUnlinked = ({ sources }: SketchLink): boolean =>
    SKETCH_PARAMS.every(param => sources[param] === null);

const field = (value: object, key: string): unknown =>
    Object.entries(value).find(([name]) => name === key)?.[1];

export const parseSketchLink = (value: unknown): SketchLink => {
    const sources = typeof value === 'object' && value !== null ? field(value, 'sources') : null;

    return SKETCH_PARAMS.reduce((link, param) => {
        const source =
            typeof sources === 'object' && sources !== null ? field(sources, param) : null;

        return typeof source === 'string' ? linkedSketch(link, param, source) : link;
    }, unlinkedSketch);
};
