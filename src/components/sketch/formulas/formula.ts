export type Formula = {
    readonly label: string;
    readonly summary: string;
    readonly source: string;
};

export type GuideEntry = {
    readonly term: string;
    readonly text: string;
};

// Must describe what sketch.vert actually passes in and reads back, or it teaches the wrong contract.
export const FORMULA_GUIDE: readonly GuideEntry[] = [
    {
        term: 'vec3 formula(float x, float y, float t)',
        text: 'Runs on the GPU once for every point of the lattice and returns where that point goes.',
    },
    {
        term: 'x, y',
        text: "The point's place on the lattice, from -1 to 1: left to right and bottom to top. The lattice setting decides how many points there are.",
    },
    {
        term: 't',
        text: 'The playhead, from 0 to 1 over one loop of the timeline. t * 2.0 * PI is an angle that loops without a jump.',
    },
    {
        term: 'return .xy',
        text: 'Where to draw the point, from -1 to 1 across the canvas. Return x, y unchanged for a flat grid.',
    },
    {
        term: 'return .z',
        text: 'Depth, from 0 to 1. It picks the colour from the theme and, in dots mode, the dot size. In surface mode, larger is nearer.',
    },
    {
        term: 'PI, helpers',
        text: 'PI is defined for you, and you can write your own functions above formula. If an edit does not compile, the error shows below and the last working version keeps running.',
    },
];
