fn formula(x: f32, y: f32, t: f32) -> vec3f {
    let phase = t * 2.0 * PI;
    let travel = cos(phase) * 0.55;
    let left = length(vec2f(x - travel, y));
    let right = length(vec2f(x + travel, y));
    let wave = sin(left * 14.0 - phase) + sin(right * 14.0 - phase);

    return vec3f(x, y, 0.5 + 0.25 * wave);
}
