fn formula(x: f32, y: f32, t: f32) -> vec3f {
    let radius = length(vec2f(x, y));
    let angle = atan2(y, x);
    let petals = 0.5 + 0.5 * cos(5.0 * angle + t * 2.0 * PI);
    let reach = radius * (0.35 + 0.65 * petals);

    return vec3f(cos(angle) * reach, sin(angle) * reach, 0.2 + 0.8 * petals * (1.0 - radius * 0.5));
}
