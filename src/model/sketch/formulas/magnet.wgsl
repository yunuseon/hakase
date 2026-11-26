// k1: reach
// k2: pull
// k3: rings
// k4: hue

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let here = vec2f(x, y);
    let toward = pointer - here;
    let reach = 0.15 + 0.6 * k1;
    let pull = exp(-dot(toward, toward) / (reach * reach)) * k2 * 0.8 * (1.0 + pointerDown);
    let rings = 0.5 + 0.5 * sin(length(toward) * (6.0 + 30.0 * k3) - t * 2.0 * PI);
    let depth = 0.25 + 0.75 * mix(rings, 1.0, pull);
    let tint = 0.65 + 0.35 * sin(atan2(toward.y, toward.x) + 2.0 * PI * k4);

    return vec4f(here + toward * pull, depth, tint);
}
