// k1: pull

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let e = 0.04;
    let here = paintAt(x, y);
    let slope = vec2f(paintAt(x + e, y) - paintAt(x - e, y), paintAt(x, y + e) - paintAt(x, y - e)) / (2.0 * e);
    let swing = sin(2.0 * PI * t + 6.0 * here);
    let along = vec2f(-slope.y, slope.x);
    let moved = vec2f(x, y) + (0.04 + 0.12 * k1) * swing * along + 0.05 * here * slope;

    return vec4f(moved, 0.3 * here, 0.35 + 0.65 * here);
}
