fn formula(x: f32, y: f32, t: f32) -> vec3f {
    let phase = t * 2.0 * PI;
    let warp = 0.5 + 0.5 * cos(3.0 * (x + y) * PI + phase);

    return vec3f(
        x + 0.18 * sin(3.0 * y * PI + phase),
        y + 0.18 * sin(3.0 * x * PI - phase),
        0.15 + 0.8 * warp,
    );
}
