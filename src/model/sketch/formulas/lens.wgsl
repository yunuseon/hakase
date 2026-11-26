// k1: size
// k2: zoom

fn formula(x: f32, y: f32, t: f32) -> vec3f {
    let away = vec2f(x, y) - pointer;
    let radius = 0.2 + 0.6 * k1;
    let d = length(away);
    let inside = 1.0 - smoothstep(0.0, radius, d);
    let zoom = 1.0 + (0.5 + 2.5 * k2) * inside * inside;
    let wobble = 0.02 * sin(t * 2.0 * PI - d * 14.0) * inside;

    return vec3f(pointer + away * (zoom + wobble), 0.5 + 0.5 * inside);
}
