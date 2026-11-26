// k1: threshold
const STEPS = 120;

// Four neighbours and fourteen colours: with all eight neighbours the field freezes into still patches.
const COLOURS = 14.0;

fn initial(x: f32, y: f32) -> vec4f {
    return vec4f(floor(fract(sin(dot(vec2f(x, y), vec2f(12.9898, 78.233))) * 43758.5453) * COLOURS), 0.0, 0.0, 0.0);
}

fn ahead(dx: i32, dy: i32, next: f32) -> f32 {
    return select(0.0, 1.0, abs(neighbour(dx, dy).x - next) < 0.5);
}

fn evolve(x: f32, y: f32, t: f32) -> vec4f {
    let colour = state().x;
    let next = floorMod(colour + 1.0, COLOURS);
    let count = ahead(1, 0, next) + ahead(-1, 0, next) + ahead(0, 1, next) + ahead(0, -1, next);

    // One neighbour ahead winds spirals; past half on k1 it takes two, and the noise holds out longer.
    return vec4f(select(colour, next, count >= select(1.0, 2.0, k1 > 0.5)), 0.0, 0.0, 0.0);
}

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let colour = state().x / COLOURS;

    return vec4f(x, y, 0.02 * sin(2.0 * PI * colour), 0.3 + 0.7 * colour);
}
