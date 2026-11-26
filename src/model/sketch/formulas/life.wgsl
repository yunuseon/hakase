// k1: density
// k2: glow
// Ten generations a second: one per frame would be too fast to follow.
const STEPS = 10;

fn hash(p: vec2f) -> f32 {
    return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453);
}

fn initial(x: f32, y: f32) -> vec4f {
    let alive = step(0.75 - 0.4 * k1, hash(vec2f(x, y)));

    return vec4f(alive, alive, 0.0, 0.0);
}

fn evolve(x: f32, y: f32, t: f32) -> vec4f {
    var around = 0.0;

    for (var dx = -1; dx <= 1; dx++) {
        for (var dy = -1; dy <= 1; dy++) {
            if (dx != 0 || dy != 0) {
                around += neighbour(dx, dy).x;
            }
        }
    }

    let alive = state().x;
    let pressed = vec2f(x, y) - pointer;
    let next = max(
        select(0.0, 1.0, around == 3.0 || (alive > 0.5 && around == 2.0)),
        pointerDown * step(dot(pressed, pressed), 0.002),
    );
    // A glow that fades after a cell dies, so the trails of gliders stay visible.
    let glow = max(next, state().y * (0.6 + 0.35 * k2));

    return vec4f(next, glow, 0.0, 0.0);
}

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let here = state();

    return vec4f(x, y, 0.15 * here.x, 0.3 + 0.7 * here.y);
}
