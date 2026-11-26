// k1: hills
// k2: camera height

fn height(x: f32, y: f32) -> f32 {
    return 0.11 * sin(2.0 * PI * x + 3.0 * PI * y) +
        0.07 * sin(5.0 * PI * x - 4.0 * PI * y) * cos(2.0 * PI * y) +
        0.03 * sin(11.0 * PI * (x + y));
}

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    // 2.0 * t, not t: the ground repeats every 2 units, so a loop of the playhead flies one full repeat.
    let h = height(x, y + 2.0 * t);

    return vec4f(x, y, h * (1.0 + 3.0 * k1), 0.35 + 0.65 * clamp(0.5 + 3.0 * h, 0.0, 1.0));
}

// Low over the ground and looking across it, with z as up: the hills are height, not depth.
fn camera(t: f32) -> Camera {
    let sway = 0.25 * sin(t * 2.0 * PI);
    let eye = vec3f(sway, -2.8, 0.7 + 0.8 * k2);

    return Camera(eye, vec3f(sway * 0.5, 0.3, 0.0), vec3f(0.0, 0.0, 1.0));
}
