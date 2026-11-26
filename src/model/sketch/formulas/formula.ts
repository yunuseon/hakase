export type Formula = {
    readonly label: string;
    readonly summary: string;
    readonly source: string;
};

export type GuideEntry = {
    readonly term: string;
    readonly text: string;
};

// Must describe what sketch.wgsl actually passes in and reads back, or it teaches the wrong contract.
export const FORMULA_GUIDE: readonly GuideEntry[] = [
    {
        term: 'fn formula(x: f32, y: f32, t: f32) -> vec3f',
        text: 'Runs on the GPU once for every point of the lattice and returns where that point goes. Formulas are written in WGSL, the language of WebGPU.',
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
        term: 'fn camera(t: f32) -> Camera',
        text: 'Optional. Define it beside formula to script the camera: return Camera(eye, centre, up), where eye is where the camera sits, centre what it looks at, and up which way is up on screen. It runs with t, so cameras can circle, fly and sway, and a loop of the playhead loops the shot. Without it the camera looks straight down from above.',
    },
    {
        term: 'dragging the sketch',
        text: 'Drag to orbit around the camera target, scroll to move closer or further, and double-click or press reset view to undo your orbit. A scripted camera keeps moving underneath your orbit. Axes draws x in red, y in green and z in blue, with ticks every 0.5 and the -1 to 1 square at z = 0. Fit decides how that square meets a canvas that is not square: contain shows all of it, cover fills the canvas and crops, stretch fills it squashed. Lens switches between perspective and orthographic, where parallel lines stay parallel and nearness no longer changes dot size. Trails fades each frame into the next instead of clearing it.',
    },
    {
        term: 'fn formula(...) -> vec4f and .w',
        text: 'Declare formula as returning vec4f instead and the fourth value is a tint, from 0 to 1, that picks the colour from the theme on its own, so colour and depth can tell different things. Low tints are the backdrop end of the theme and fade into the canvas, so the examples keep theirs between about 0.3 and 1.',
    },
    {
        term: 'k1, k2, k3, k4',
        text: 'Four knobs from 0 to 1, set by the sliders under each sketch. Use them for any number you want to play with live, like sin(x * k1 * 20.0). Every sketch has its own. Name one with a comment line like // k1: feed rate and its slider is labelled feed rate; only the knobs a formula really reads get a slider. Give a knob a motion of 1×, 2×, 4× or 8× per loop and it swings from 0 up to the value of its slider and back, so it animates without any code.',
    },
    {
        term: 'paintAt(x, y), paint(p)',
        text: 'The painting plugged into the sketch, from 0 where it is bare to 1 where it is fully inked. The square from -1 to 1 covers it, with its top row at y = 1, and it reads smoothly between pixels. A painting with several frames plays them across the loop, held or fading one into the next. Plug a paint window into the paint input in the state menu; with none plugged in, paint is 0 everywhere.',
    },
    {
        term: 'pointer, pointerOnGround',
        text: 'The point under the mouse as a vec2 in the same coordinates as x and y, so pointer - vec2(x, y) stays under the cursor however the camera turns and whichever space is picked: in polar, cylindrical and spherical space it is read where the mouse meets the shape z = 0 becomes. When the mouse misses it, pointerOnGround is 0.0 instead of 1.0. A formula with its own space() gets the point on the flat ground instead.',
    },
    {
        term: 'pointerOrigin, pointerDirection, pointerDistance(p), pointerNear(x, y)',
        text: 'The mouse ray itself, for shapes that are not on the ground: it starts at the camera and passes under the cursor. pointerDistance(p) is how far a point is from that ray, so exp(-pow(pointerDistance(p), 2.0) / 0.03) is 1 right under the mouse and fades away from it. pointerNear(x, y) measures the same for the point x, y after the space has placed it, which also works with a space() of your own.',
    },
    {
        term: 'pointerDown',
        text: 'Shift-drag on a sketch to press: pointerDown is 1.0 while pressed and 0.0 otherwise. A plain drag still orbits the camera.',
    },
    {
        term: 'lattice, focus, space',
        text: 'Three pickers under each sketch reshape a formula without touching its code. Lattice sets where the points are: a grid, rings and spokes, a hex pattern, or a jittered grid. Focus bunches them towards the middle or out to the edges. Space reads what formula returns in another coordinate system: polar wraps it into a disc, cylindrical rolls it into a tube, spherical into a ball. In all three x is the coordinate that goes around.',
    },
    {
        term: 'fn lattice(uv: vec2f, index: f32, count: f32) -> vec2f',
        text: 'Optional. Define it to place the points yourself: uv is the grid position from -1 to 1, index counts the points from 0 and count is how many there are. What it returns becomes the x and y that formula receives. The lattice picker and focus then have no effect. If your lattice goes all the way around in x, add const WRAPS = true; so lines and surfaces close the seam.',
    },
    {
        term: 'fn space(p: vec3f) -> vec3f',
        text: 'Optional. Define it to map what formula returns to the point that is drawn, for twists, warps or your own coordinate system. The space picker then has no effect.',
    },
    {
        term: 'fn evolve(x: f32, y: f32, t: f32) -> vec4f',
        text: 'Optional. Define it and every lattice point keeps four numbers of state from step to step: evolve returns the next state from state(), this point now, and neighbour(dx, dy), the point dx columns and dy rows away, which wraps at the edges. cell() is the place of this point on that grid, -1 to 1: use it, not x and y, for rules about places like the middle or the rim, because the lattice and focus move where x and y are drawn. formula reads state() too, to place or tint the point. That is enough for ripple tanks, reaction-diffusion and cellular automata; Tank and Coral are worked examples.',
    },
    {
        term: 'fn initial(x: f32, y: f32) -> vec4f, const STEPS',
        text: 'initial sets the state at the start of the loop, all zeros without it. The state is stepped 60 times a second, or as often as const STEPS = 240; says. Scrubbing back or starting the loop again replays from initial, so a moment always looks the same, in the strip and in an export too.',
    },
    {
        term: 'WGSL, not GLSL',
        text: 'Types are f32, vec2f, vec3f and vec4f; let names a value and var one that changes. There is no ternary: select(ifFalse, ifTrue, condition). atan2(y, x) is the two-argument arctangent, and floorMod(x, y) is the remainder that wraps negative numbers round, like mod in GLSL; the % operator does not. A number needs its decimal point, 2.0 not 2, and an integer is turned into a float with f32(i).',
    },
    {
        term: 'PI, helpers',
        text: 'PI is defined for you, and you can write your own functions above formula. If an edit does not compile, the error shows below and the last working version keeps running.',
    },
];
