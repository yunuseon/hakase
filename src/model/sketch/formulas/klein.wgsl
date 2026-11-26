fn spin(q: vec3f, yaw: f32, pitch: f32) -> vec3f {
    let p = vec3f(cos(yaw) * q.x + sin(yaw) * q.z, q.y, cos(yaw) * q.z - sin(yaw) * q.x);

    return vec3f(p.x, cos(pitch) * p.y - sin(pitch) * p.z, sin(pitch) * p.y + cos(pitch) * p.z);
}

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let phase = t * 2.0 * PI;
    let u = (x + 1.0) * PI;
    let v = (y + 1.0) * PI;
    let half_u = u * 0.5 + phase;
    let sweep = 2.0 + cos(half_u) * sin(v) - sin(half_u) * sin(2.0 * v);
    let shape = vec3f(
        sweep * cos(u),
        sweep * sin(u),
        sin(half_u) * sin(v) + cos(half_u) * sin(2.0 * v),
    ) * 0.27;
    let p = spin(shape, phase, 1.1 + 0.3 * cos(phase));

    return vec4f(p * 0.8, 0.35 + 0.65 * clamp(0.5 + p.z, 0.0, 1.0));
}
