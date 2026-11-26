fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let ink = paintAt(x, y);
    let sweep = 0.5 + 0.5 * sin(2.0 * PI * (t - 0.35 * (x + y)));
    let lift = ink * (0.4 + 0.6 * sweep);

    return vec4f(x, y, mix(-0.8, 0.5, lift), mix(0.08, 1.0, ink));
}
