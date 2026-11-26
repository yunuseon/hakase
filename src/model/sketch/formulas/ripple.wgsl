fn formula(x: f32, y: f32, t: f32) -> vec3f {
    let depth = length(vec2f(x, y)) / sqrt(2.0);
    let wave = sin(2.0 * (depth + t) * PI);

    return vec3f(x, y * ((wave + depth) / 2.0), depth);
}
