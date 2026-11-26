fn knot(s: f32) -> vec3f {
    return vec3f(sin(s) + 2.0 * sin(2.0 * s), cos(s) - 2.0 * cos(2.0 * s), -sin(3.0 * s));
}

fn formula(x: f32, y: f32, t: f32) -> vec4f {
    let phase = t * 2.0 * PI;
    let s = x * PI;
    let around = y * PI + 3.0 * s + phase;
    let centre = knot(s);
    let tangent = normalize(knot(s + 0.001) - knot(s - 0.001));
    let normal = normalize(cross(tangent, vec3f(0.0, 0.0, 1.0)));
    let binormal = cross(tangent, normal);
    let tube = 0.42 + 0.08 * sin(4.0 * around);
    let p = (centre + tube * (cos(around) * normal + sin(around) * binormal)) * 0.26;

    return vec4f(p * 0.8, 0.35 + 0.65 * clamp(0.5 + p.z, 0.0, 1.0));
}

// The knot holds still; the camera circles it once per loop and rises and dips twice.
fn camera(t: f32) -> Camera {
    let a = t * 2.0 * PI;
    let eye = vec3f(4.2 * sin(a), 1.4 * sin(2.0 * a), 4.2 * cos(a));

    return Camera(eye, vec3f(0.0), vec3f(0.0, 1.0, 0.0));
}
