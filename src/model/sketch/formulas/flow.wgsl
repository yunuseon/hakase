// k1: travel
// k2: hue

fn field(p: vec2f, phase: f32) -> vec2f {
    return vec2f(sin(5.0 * p.y + phase + sin(3.0 * p.x)), sin(5.0 * p.x - phase + sin(3.0 * p.y)));
}

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let phase = t * 2.0 * PI;
    let p = vec2f(x, y);
    let v = field(p, phase);
    let speed = length(v) / sqrt(2.0);
    let tint = 0.65 + 0.35 * sin(atan2(v.y, v.x) + 2.0 * PI * k2);

    return vec4f(p + 0.12 * k1 * v, 0.4 + 0.6 * speed, tint);
}
