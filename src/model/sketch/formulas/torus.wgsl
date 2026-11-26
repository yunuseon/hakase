fn spin(q: vec3f, yaw: f32, pitch: f32) -> vec3f {
    let p = vec3f(cos(yaw) * q.x + sin(yaw) * q.z, q.y, cos(yaw) * q.z - sin(yaw) * q.x);

    return vec3f(p.x, cos(pitch) * p.y - sin(pitch) * p.z, sin(pitch) * p.y + cos(pitch) * p.z);
}

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let phase = t * 2.0 * PI;
    let u = x * PI;
    let v = y * PI;
    let tube = 0.3 + 0.07 * sin(6.0 * u + 3.0 * v - 2.0 * phase);
    let ring = 0.6 + tube * cos(v);
    let p = spin(vec3f(ring * cos(u), ring * sin(u), tube * sin(v)), phase, 1.0 + 0.4 * sin(phase));
    let hover = exp(-pow(pointerDistance(p * 0.8), 2.0) / 0.03);
    let shape = p * 0.8 * (1.0 + 0.25 * hover * (1.0 + 2.0 * pointerDown));

    return vec4f(shape, clamp(0.35 + 0.65 * clamp(0.5 + p.z, 0.0, 1.0) + 0.4 * hover, 0.0, 1.0));
}
