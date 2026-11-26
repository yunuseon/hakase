fn formula(x: f32, y: f32, t: f32) -> vec3f {
    let radius = length(vec2f(x, y));
    let angle = atan2(y, x) + radius * 3.0 + t * 2.0 * PI;
    let arms = 0.5 + 0.5 * sin(angle * 3.0);

    return vec3f(cos(angle) * radius, sin(angle) * radius, 0.25 + 0.75 * arms);
}
