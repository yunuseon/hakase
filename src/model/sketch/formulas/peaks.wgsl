// k1: diagonal

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let phase = t * 2.0 * PI;
    let a = sin(3.0 * PI * x + phase);
    let b = sin(3.0 * PI * y - phase);
    let c = sin(2.0 * PI * (x + y) * (1.0 + 2.0 * k1) + 2.0 * phase);
    let sum = (a + b + c) / 3.0;

    return vec4f(x, y, 0.25 + 0.75 * abs(sum), 0.65 + 0.35 * sum);
}
