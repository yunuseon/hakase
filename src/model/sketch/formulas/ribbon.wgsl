// k1: twist

// Twists the formula's flat strip around the vertical axis, more the higher it goes.
fn space(p: vec3f) -> vec3f {
    let twist = p.y * PI * (0.5 + 1.5 * k1);
    let depth = p.z - 0.5;

    return vec3f(p.x * cos(twist) - depth * sin(twist), p.y, p.x * sin(twist) + depth * cos(twist));
}

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let wave = 0.15 * sin(3.0 * PI * x + t * 2.0 * PI);
    let tint = 0.65 + 0.35 * sin(2.0 * PI * y - t * 2.0 * PI);

    return vec4f(x * 0.45, y, 0.5 + wave, tint);
}
