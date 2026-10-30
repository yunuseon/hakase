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
        term: 'return .xyz',
        text: 'A point in space. x runs right and y up as on screen, and z comes toward the default camera, which looks straight down from above: at z = 0 the -1 to 1 square fills the canvas. Return x, y and a height for a landscape, or any 3D shape.',
    },
    {
        term: 'depth and colour',
        text: 'Points nearer the camera draw bigger dots, and the depth slider exaggerates that. Unless you return a tint, z also picks the colour from the theme.',
    },
    {
        term: 'Camera camera(float t)',
        text: 'Optional. Define it beside formula to script the camera: return Camera(eye, target, up), where eye is where the camera sits, target what it looks at, and up which way is up on screen. It runs with t, so cameras can circle, fly and sway, and a loop of the playhead loops the shot. Without it the camera looks straight down from above.',
    },
    {
        term: 'dragging the sketch',
        text: 'Drag to orbit around the camera target, scroll to move closer or further, and double-click to undo your orbit. A scripted camera keeps moving underneath your orbit. Axes draws x in red, y in green and z in blue, with ticks every 0.5 and the -1 to 1 square at z = 0.',
    },
    {
        term: 'vec4 formula(...) and .w',
        text: 'Declare formula as returning vec4 instead and the fourth value is a tint, from 0 to 1, that picks the colour from the theme on its own, so colour and depth can tell different things. Low tints are the backdrop end of the theme and fade into the canvas, so the examples keep theirs between about 0.3 and 1.',
    },
    {
        term: 'k1, k2, k3, k4',
        text: 'Four knobs from 0 to 1, set by the sliders under each sketch. Use them for any number you want to play with live, like sin(x * k1 * 20.0). Every sketch has its own.',
    },
    {
        term: 'pointer, pointerOnGround',
        text: 'Where the mouse ray touches the ground, the z = 0 plane, as a vec2 in the same space as x and y, so it stays under the cursor however the camera turns. When the ray misses the ground it points toward the horizon and pointerOnGround is 0.0 instead of 1.0.',
    },
    {
        term: 'pointerOrigin, pointerDirection, pointerDistance(p)',
        text: 'The mouse ray itself, for shapes that are not on the ground: it starts at the camera and passes under the cursor. pointerDistance(p) is how far a point is from that ray, so exp(-pow(pointerDistance(p), 2.0) / 0.03) is 1 right under the mouse and fades away from it.',
    },
    {
        term: 'pointerDown',
        text: 'Shift-drag on a sketch to press: pointerDown is 1.0 while pressed and 0.0 otherwise. A plain drag still orbits the camera.',
    },
    {
        term: 'PI, helpers',
        text: 'PI is defined for you, and you can write your own functions above formula. If an edit does not compile, the error shows below and the last working version keeps running.',
    },
];
