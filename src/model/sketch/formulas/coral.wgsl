// k1: feed
// k2: kill
// Gray-Scott runs slowly per step, so many steps a second; a replay from the start costs more for it.
const STEPS = 480;

fn initial(x: f32, y: f32) -> vec4f {
    let seeded = step(length(vec2f(x, y)), 0.12) + step(length(vec2f(x, y) - vec2f(0.45, -0.3)), 0.08);

    return vec4f(1.0, min(seeded, 1.0), 0.0, 0.0);
}

fn evolve(x: f32, y: f32, t: f32) -> vec4f {
    let here = state().xy;
    let near = neighbour(1, 0).xy + neighbour(-1, 0).xy + neighbour(0, 1).xy + neighbour(0, -1).xy;
    let corners = neighbour(1, 1).xy + neighbour(-1, 1).xy + neighbour(1, -1).xy + neighbour(-1, -1).xy;
    let spread = 0.2 * near + 0.05 * corners - here;
    let feed = 0.03 + 0.03 * k1;
    let kill = 0.055 + 0.01 * k2;
    let reaction = here.x * here.y * here.y;
    let pressed = vec2f(x, y) - pointer;
    let next = here +
        vec2f(spread.x - reaction + feed * (1.0 - here.x), 0.5 * spread.y + reaction - (kill + feed) * here.y) +
        vec2f(0.0, pointerDown * 0.5 * exp(-dot(pressed, pressed) * 400.0));

    return vec4f(clamp(next, vec2f(0.0), vec2f(1.0)), 0.0, 0.0);
}

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let grown = state().y;

    return vec4f(x, y, 0.4 * grown, 0.35 + 1.6 * grown);
}
