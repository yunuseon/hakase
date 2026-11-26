const PI = 3.14159265358979;
const MAX_OBJECTS = 16;
const MATTE = 0;
const GLOSS = 1;
const METAL = 2;
const GLASS = 3;
const LIGHT = 4;
const SHAPE_SPHERE = 0;
const SHAPE_BOX = 1;
const SHAPE_TORUS = 2;
const SHAPE_CYLINDER = 3;
const SHAPE_PLANE = 4;
const SHAPE_CODE = 5;
const PITCH_LIMIT = 1.5607963;

// Must match traceData in trace.ts, field for field.
struct Trace {
    resolution: vec2f,
    playhead: f32,
    sunPower: f32,
    // yaw, pitch, distance as a multiple
    orbit: vec4f,
    // sun direction, sky
    sun: vec4f,
    knobs: vec4f,
    // objects, samples in this batch, bands in all, first band
    counts: vec4i,
    // bands traced now, bounces, unused, unused
    more: vec4i,
    // field of view in degrees
    lens: vec4f,
};

@group(0) @binding(0) var<uniform> trace: Trace;
@group(0) @binding(1) var<uniform> objects: array<vec4f, 48>;
@group(0) @binding(2) var palette: texture_2d<f32>;
@group(0) @binding(3) var paletteSampler: sampler;
@group(0) @binding(4) var previous: texture_2d<f32>;
@group(0) @binding(5) var output: texture_storage_2d<rgba32float, write>;

struct Camera {
    eye: vec3f,
    centre: vec3f,
    up: vec3f,
};

struct Hit {
    d: f32,
    material: i32,
    tint: f32,
    rough: f32,
    glow: f32,
};

// Plain names, so the scene's code reads them as a sketch's formula does.
var<private> k1: f32;
var<private> k2: f32;
var<private> k3: f32;
var<private> k4: f32;
// The object world() last found nearest; a global because Hit is the code's own struct and has no room for it.
var<private> nearest: i32;
var<private> seed: u32;

fn hit(d: f32, material: i32, tint: f32, rough: f32) -> Hit {
    return Hit(d, material, tint, rough, 0.0);
}

fn glowing(d: f32, tint: f32, glow: f32) -> Hit {
    return Hit(d, LIGHT, tint, 0.0, glow);
}

fn closer(a: Hit, b: Hit) -> Hit {
    if (a.d < b.d) {
        return a;
    }

    return b;
}

fn floorMod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

fn sdSphere(p: vec3f, r: f32) -> f32 {
    return length(p) - r;
}

fn sdBox(p: vec3f, b: vec3f) -> f32 {
    let q = abs(p) - b;

    return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn sdTorus(p: vec3f, major: f32, minor: f32) -> f32 {
    return length(vec2f(length(p.xz) - major, p.y)) - minor;
}

fn sdCylinder(p: vec3f, r: f32, h: f32) -> f32 {
    let d = abs(vec2f(length(p.xz), p.y)) - vec2f(r, h);

    return min(max(d.x, d.y), 0.0) + length(max(d, vec2f(0.0)));
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
    let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);

    return mix(b, a, h) - k * h * (1.0 - h);
}

// The ramp is sRGB; light adds up in linear terms, so it is undone here and the tone map puts it back.
fn colourAt(tint: f32) -> vec3f {
    let at = vec2f(clamp(tint, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0, 0.5);

    return pow(textureSampleLevel(palette, paletteSampler, at, 0.0).rgb, vec3f(2.2));
}

fn turned(p: vec3f, turn: f32) -> vec3f {
    let a = -turn * 2.0 * PI;

    return vec3f(cos(a) * p.x - sin(a) * p.z, p.y, sin(a) * p.x + cos(a) * p.z);
}

fn codeAt(q: vec3f, size: f32, t: f32) -> Hit {
    var h = customHit(q / size, t);
    h.d *= size;

    return h;
}

fn world(p: vec3f, t: f32) -> Hit {
    return objectsAt(p, t);
}

fn normalAt(p: vec3f, t: f32) -> vec3f {
    let e = vec2f(0.0005, -0.0005);

    return normalize(
        e.xyy * world(p + e.xyy, t).d + e.yyx * world(p + e.yyx, t).d +
            e.yxy * world(p + e.yxy, t).d + e.xxx * world(p + e.xxx, t).d,
    );
}

const STEPS = 160;
const FAR = 60.0;

struct Marched {
    found: bool,
    travelled: f32,
    hit: Hit,
    which: i32,
};

fn march(origin: vec3f, direction: vec3f, t: f32, far: f32) -> Marched {
    var travelled = 0.001;

    for (var i = 0; i < STEPS; i++) {
        let h = world(origin + direction * travelled, t);
        let d = abs(h.d);

        if (d < 0.003 * max(1.0, travelled)) {
            return Marched(true, travelled, h, nearest);
        }

        travelled += d * 0.9;

        if (travelled > far) {
            break;
        }
    }

    return Marched(false, travelled, Hit(FAR, MATTE, 0.0, 1.0, 0.0), -1);
}

fn hashed(value: u32) -> u32 {
    var x = value;
    x ^= x >> 16u;
    x *= 0x7feb352du;
    x ^= x >> 15u;
    x *= 0x846ca68bu;
    x ^= x >> 16u;

    return x;
}

fn random() -> f32 {
    seed = hashed(seed);

    return f32(seed) / 4294967296.0;
}

fn cosineAround(n: vec3f) -> vec3f {
    let u = random();
    let v = random();
    let r = sqrt(u);
    let a = 2.0 * PI * v;
    let side = normalize(select(cross(n, vec3f(1.0, 0.0, 0.0)), cross(n, vec3f(0.0, 1.0, 0.0)), abs(n.y) < 0.99));
    let other = cross(n, side);

    return normalize(side * r * cos(a) + other * r * sin(a) + n * sqrt(1.0 - u));
}

fn sunGlint(direction: vec3f) -> vec3f {
    return vec3f(pow(max(dot(direction, trace.sun.xyz), 0.0), 600.0) * trace.sunPower * 40.0);
}

fn sky(direction: vec3f) -> vec3f {
    let up = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);

    return mix(colourAt(0.15), colourAt(0.9), up) * trace.sun.w + sunGlint(direction);
}

fn shadowed(origin: vec3f, t: f32) -> bool {
    let marched = march(origin, trace.sun.xyz, t, FAR);

    return marched.found && marched.hit.material != GLASS;
}

// A sphere that holds every glowing part of an object, radius 0 for none a cone can hold: a plane, or code with no bounds().
fn lightSphere(i: i32, t: f32) -> vec4f {
    let place = objects[i * 3];
    let look = objects[i * 3 + 1];
    let shape = i32(look.x + 0.5);

    if (shape == SHAPE_CODE) {
        let b = codeBounds(t);

        return vec4f(place.xyz + turned(b.xyz * place.w, -objects[i * 3 + 2].x), b.w * place.w);
    }

    if (i32(look.y + 0.5) != LIGHT) {
        return vec4f(0.0);
    }

    switch shape {
        case SHAPE_SPHERE: {
            return vec4f(place.xyz, place.w);
        }
        case SHAPE_BOX: {
            return vec4f(place.xyz, place.w * 1.7321);
        }
        case SHAPE_TORUS: {
            return vec4f(place.xyz, place.w * 1.3);
        }
        case SHAPE_CYLINDER: {
            return vec4f(place.xyz, place.w * 1.1181);
        }
        default: {
            return vec4f(0.0);
        }
    }
}

fn sampleable(i: i32, t: f32) -> bool {
    return lightSphere(i, t).w > 0.0;
}

// One light, picked at random, through the cone that bounds it; returns the one it sampled, whose glow a bounce that then meets it must not add again.
fn sampleLight(origin: vec3f, normal: vec3f, t: f32, light: ptr<function, vec3f>, carried: vec3f) -> i32 {
    let total = trace.counts.x;
    var count = 0;

    for (var i = 0; i < MAX_OBJECTS; i++) {
        if (i >= total) {
            break;
        }
        if (sampleable(i, t)) {
            count++;
        }
    }

    if (count == 0) {
        return -1;
    }

    var pick = min(i32(random() * f32(count)), count - 1);
    var chosen = -1;

    for (var i = 0; i < MAX_OBJECTS; i++) {
        if (i >= total) {
            break;
        }
        if (sampleable(i, t)) {
            if (pick == 0) {
                chosen = i;
                break;
            }
            pick--;
        }
    }

    let sphere = lightSphere(chosen, t);
    let reach = sphere.w;
    let toward = sphere.xyz - origin;
    let away = length(toward);

    if (away <= reach * 1.001) {
        return -1;
    }

    let cosMax = sqrt(1.0 - (reach * reach) / (away * away));
    let cosine = 1.0 - random() * (1.0 - cosMax);
    let sine = sqrt(max(0.0, 1.0 - cosine * cosine));
    let a = 2.0 * PI * random();
    let axis = toward / away;
    let side = normalize(select(cross(axis, vec3f(1.0, 0.0, 0.0)), cross(axis, vec3f(0.0, 1.0, 0.0)), abs(axis.y) < 0.99));
    let other = cross(axis, side);
    let direction = normalize(axis * cosine + (side * cos(a) + other * sin(a)) * sine);
    let facing = dot(normal, direction);

    if (facing > 0.0) {
        let marched = march(origin, direction, t, away + reach);

        if (marched.found && marched.which == chosen) {
            let glow = colourAt(marched.hit.tint) * marched.hit.glow;
            *light += carried * glow * facing * 2.0 * (1.0 - cosMax) * f32(count);
        }
    }

    return chosen;
}

fn fresnel(cosine: f32, ratio: f32) -> f32 {
    var r = (1.0 - ratio) / (1.0 + ratio);
    r *= r;

    return r + (1.0 - r) * pow(1.0 - cosine, 5.0);
}

fn traced(start: vec3f, heading: vec3f, t: f32) -> vec3f {
    var light = vec3f(0.0);
    var carried = vec3f(1.0);
    var origin = start;
    var direction = heading;
    var direct = true;
    var sampled = -1;
    var scattered = 0;

    // Glass spends no bounce: a ray through it meets a surface at every pass, and running out left black rings in a lens.
    for (var bounce = 0; bounce < 8; bounce++) {
        if (scattered >= trace.more.y) {
            break;
        }

        let marched = march(origin, direction, t, FAR);

        if (!marched.found) {
            light += carried * select(sky(direction) - sunGlint(direction), sky(direction), direct);
            break;
        }

        let h = marched.hit;
        let p = origin + direction * marched.travelled;
        let n = normalAt(p, t);
        let albedo = colourAt(h.tint);
        let inside = dot(n, direction) > 0.0;
        let facing = select(n, -n, inside);

        if (h.material == LIGHT) {
            if (marched.which != sampled) {
                light += carried * albedo * h.glow;
            }
            break;
        }

        sampled = -1;

        if (h.material == GLASS) {
            let ratio = select(1.0 / 1.5, 1.5, inside);
            let cosine = min(dot(-direction, facing), 1.0);
            let bent = refract(direction, facing, ratio);
            let reflects = dot(bent, bent) < 0.5 || random() < fresnel(cosine, ratio);
            direction = normalize(select(bent, reflect(direction, facing), reflects));
            direction = normalize(direction + h.rough * 0.3 * (cosineAround(direction) - direction));
            origin = p + select(-facing, facing, reflects) * 0.006;
            carried *= mix(vec3f(1.0), albedo, 0.35);
            direct = true;
        } else {
            let specular = h.material == METAL ||
                (h.material == GLOSS && random() < fresnel(max(dot(-direction, facing), 0.0), 1.0 / 1.5) + 0.04);
            origin = p + facing * 0.006;

            if (specular) {
                let mirrored = reflect(direction, facing);
                direction = normalize(mix(mirrored, cosineAround(facing), h.rough * h.rough));
                if (dot(direction, facing) <= 0.0) {
                    direction = mirrored;
                }
                carried *= select(vec3f(1.0), albedo, h.material == METAL);
                direct = h.rough < 0.2;
                scattered++;
            } else {
                let lit = max(dot(facing, trace.sun.xyz), 0.0);
                if (lit > 0.0 && trace.sunPower > 0.0 && !shadowed(origin, t)) {
                    light += carried * albedo * lit * trace.sunPower;
                }
                sampled = sampleLight(origin, facing, t, &light, carried * albedo);
                direction = cosineAround(facing);
                carried *= albedo;
                direct = false;
                scattered++;
            }
        }

        if (bounce > 2) {
            let keep = clamp(max(carried.r, max(carried.g, carried.b)), 0.05, 1.0);
            if (random() > keep) {
                break;
            }
            carried /= keep;
        }
    }

    return light;
}

fn orbited(c: Camera) -> vec3f {
    let pole = normalize(c.up);
    let offset = c.eye - c.centre;
    let reach = length(offset);
    let level = offset - dot(offset, pole) * pole;
    let ahead = select(normalize(cross(pole, vec3f(0.0, 0.0, 1.0) + pole.yzx)), normalize(level), length(level) > 1e-5);
    let aside = cross(pole, ahead);
    let orbit = trace.orbit;
    let elevation = clamp(asin(clamp(dot(offset, pole) / reach, -1.0, 1.0)) + orbit.y, -PITCH_LIMIT, PITCH_LIMIT);
    let around = cos(orbit.x) * ahead + sin(orbit.x) * aside;

    return c.centre + (cos(elevation) * around + sin(elevation) * pole) * reach * orbit.z;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
    let size = vec2i(trace.resolution);
    let pixel = vec2i(id.xy);

    if (pixel.x >= size.x || pixel.y >= size.y) {
        return;
    }

    let before = textureLoad(previous, pixel, 0);
    let slots = trace.counts.z;
    let first = trace.counts.w;
    // A pass may trace a run of bands of 8 rows; the others keep what they had, their own count in alpha.
    // Bands, not one pixel per 2x2 block: neighbouring pixels run in lockstep, so a scattered pass costs a whole one.
    let band = (pixel.y >> 3u) % slots;

    if (slots > 1 && (band < first || band >= first + trace.more.x)) {
        textureStore(output, pixel, before);
        return;
    }

    k1 = trace.knobs.x;
    k2 = trace.knobs.y;
    k3 = trace.knobs.z;
    k4 = trace.knobs.w;

    let done = before.a;
    let playhead = trace.playhead;
    let c = view(playhead);
    let eye = orbited(c);
    let forward = normalize(c.centre - eye);
    let crossed = cross(forward, normalize(c.up));
    let side = select(normalize(cross(forward, forward.yzx + vec3f(0.0, 0.0, 1.0))), normalize(crossed), length(crossed) > 1e-5);
    let up = cross(side, forward);
    let lens = tan(radians(trace.lens.x) * 0.5);
    let resolution = trace.resolution;
    let shorter = min(resolution.x, resolution.y);
    // Rows count down here and up in the picture's own reckoning.
    let fragment = vec2f(f32(pixel.x) + 0.5, f32(size.y - 1 - pixel.y) + 0.5);
    var sum = vec3f(0.0);

    for (var i = 0; i < 64; i++) {
        if (i >= trace.counts.y) {
            break;
        }

        // Seeded by the pixel, the sample's index and the moment, so sample n of a moment is always the same.
        seed = hashed(
            u32(pixel.x) * 1973u + u32(pixel.y) * 9277u + u32(i32(done) + i) * 26699u + u32(playhead * 65536.0) * 3779u,
        );
        let jitter = vec2f(random(), random());
        let at = (fragment - 0.5 + jitter - resolution * 0.5) / (shorter * 0.5);
        let direction = normalize(forward + (side * at.x + up * at.y) * lens);
        sum += traced(eye, direction, playhead);
    }

    let now = done + f32(trace.counts.y);
    let mean = (before.rgb * done + sum) / now;
    textureStore(output, pixel, vec4f(min(mean, vec3f(1000.0)), now));
}
