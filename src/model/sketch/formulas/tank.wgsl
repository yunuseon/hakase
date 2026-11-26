// k1: speed
// k2: sustain

fn dropAt(beat: f32) -> vec2f {
    return vec2f(fract(sin(beat * 12.9898) * 43758.5453), fract(sin(beat * 78.233) * 43758.5453)) * 1.6 - 0.8;
}

fn initial(x: f32, y: f32) -> vec4f {
    let offset = vec2f(x, y) - vec2f(0.3, 0.2);
    let drop = 0.6 * exp(-dot(offset, offset) * 80.0);

    return vec4f(drop, drop, 0.0, 0.0);
}

fn evolve(x: f32, y: f32, t: f32) -> vec4f {
    let here = state();
    let around = neighbour(1, 0).x + neighbour(-1, 0).x + neighbour(0, 1).x + neighbour(0, -1).x;
    // Above a half the explicit wave equation blows up; this stays well under it.
    let speed = 0.15 + 0.3 * k1;
    let wave = (2.0 * here.x - here.y + speed * (around - 4.0 * here.x)) * (0.990 + 0.009 * k2);
    // Four drops a loop, at fixed moments and places, so a replay lands every one the same.
    let offset = vec2f(x, y) - dropAt(floor(t * 4.0));
    let dropped = select(0.0, 0.5 * exp(-dot(offset, offset) * 120.0), fract(t * 4.0) < 0.004);
    let pressed = vec2f(x, y) - pointer;
    let next = wave + dropped + pointerDown * 0.05 * exp(-dot(pressed, pressed) * 200.0);

    return vec4f(next, here.x, 0.0, 0.0);
}

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let height = state().x;

    return vec4f(x, y, 0.8 * height, 0.55 + 1.5 * height);
}
