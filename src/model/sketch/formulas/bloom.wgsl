fn spin(q: vec3f, yaw: f32, pitch: f32) -> vec3f {
    let p = vec3f(cos(yaw) * q.x + sin(yaw) * q.z, q.y, cos(yaw) * q.z - sin(yaw) * q.x);

    return vec3f(p.x, cos(pitch) * p.y - sin(pitch) * p.z, sin(pitch) * p.y + cos(pitch) * p.z);
}

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let phase = t * 2.0 * PI;
    let theta = (y + 1.0) * 0.5 * PI;
    let phi = x * PI;
    let lobes = sin(4.0 * theta + phase) * cos(3.0 * phi - phase);
    let pulse = 0.5 + 0.5 * sin(6.0 * theta - 2.0 * phase) * sin(5.0 * phi);
    let radius = 0.5 + 0.2 * lobes + 0.06 * pulse;
    let p = spin(
        radius * vec3f(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi)),
        -phase,
        0.5 * sin(phase),
    );

    return vec4f(p * 1.2, 0.3 + 0.7 * clamp((0.5 + p.z) * (0.6 + pulse * 0.6), 0.0, 1.0));
}
