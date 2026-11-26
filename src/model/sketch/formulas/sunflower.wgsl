// k1: spacing
// k2: winding
// Its lattice goes around in x, so the sketch must close the seam where the last column meets the first.
const WRAPS = true;

// Rings spaced so each holds the same area, each turned a little further than the last: spiral arms,
// with neighbours on the grid still neighbours here, so lines and surfaces hold together.
fn lattice(uv: vec2f, index: f32, count: f32) -> vec2f {
    let ring = (uv.y + 1.0) * 0.5;
    let angle = uv.x * PI + ring * (2.0 + 4.0 * k2) * PI;

    return sqrt(ring) * vec2f(cos(angle), sin(angle));
}

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let r = length(vec2f(x, y));
    let angle = atan2(y, x);
    let pulse = 0.5 + 0.5 * sin(r * (8.0 + 16.0 * k1) - t * 2.0 * PI);
    let tint = 0.8 + 0.2 * sin(angle * 3.0 + t * 2.0 * PI);

    return vec4f(x, y, 0.25 + 0.6 * pulse, tint);
}
