// k1: height

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let ink = paintAt(x, y);
    let breath = 0.04 * sin(2.0 * PI * (t + 0.6 * length(vec2f(x, y))));

    return vec4f(x, y, ink * (0.25 + 1.2 * k1) + breath * ink, 0.3 + 0.7 * ink);
}
