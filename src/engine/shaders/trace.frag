#version 300 es
precision highp float;
precision highp int;

#define PI 3.14159265358979
#define MAX_OBJECTS 16
#define MATTE 0
#define GLOSS 1
#define METAL 2
#define GLASS 3
#define LIGHT 4
#define SHAPE_SPHERE 0
#define SHAPE_BOX 1
#define SHAPE_TORUS 2
#define SHAPE_CYLINDER 3
#define SHAPE_PLANE 4
#define SHAPE_CODE 5
#define PITCH_LIMIT 1.5607963

uniform sampler2D uPalette;
uniform sampler2D uPrevious;
uniform vec4 uObjects[MAX_OBJECTS * 3];
uniform int uCount;
uniform float uPlayhead;
uniform vec2 uResolution;
uniform vec3 uOrbit;
uniform float uDone;
uniform int uBatch;
uniform int uBounces;
uniform vec3 uSun;
uniform float uSunPower;
uniform float uSky;
uniform float uFov;
uniform float k1;
uniform float k2;
uniform float k3;
uniform float k4;

in vec2 vUv;
out vec4 colour;

struct Camera {
    vec3 eye;
    vec3 target;
    vec3 up;
};

struct Hit {
    float d;
    int material;
    float tint;
    float rough;
    float glow;
};

Hit hit(float d, int material, float tint, float rough) {
    return Hit(d, material, tint, rough, 0.0);
}

Hit glowing(float d, float tint, float glow) {
    return Hit(d, LIGHT, tint, 0.0, glow);
}

// Not a ternary: WebGL refuses one over structures.
Hit closer(Hit a, Hit b) {
    if (a.d < b.d) return a;
    return b;
}

float sdSphere(vec3 p, float r) {
    return length(p) - r;
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdTorus(vec3 p, float major, float minor) {
    return length(vec2(length(p.xz) - major, p.y)) - minor;
}

float sdCylinder(vec3 p, float r, float h) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// The ramp is sRGB; light adds up in linear terms, so it is undone here and the tone map puts it back.
vec3 colourAt(float tint) {
    return pow(texture(uPalette, vec2(clamp(tint, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0, 0.5)).rgb, vec3(2.2));
}

// Prototypes, not dead code: the scene's code and an adapter defining these are appended after this file.
Hit customHit(vec3 p, float t);
Camera view(float t);
vec4 codeBounds(float t);

vec3 turned(vec3 p, float turn) {
    float a = -turn * 2.0 * PI;
    return vec3(cos(a) * p.x - sin(a) * p.z, p.y, sin(a) * p.x + cos(a) * p.z);
}

float shapeDistance(int shape, vec3 q, float size, float t) {
    if (shape == SHAPE_SPHERE) return sdSphere(q, size);
    if (shape == SHAPE_BOX) return sdBox(q, vec3(size));
    if (shape == SHAPE_TORUS) return sdTorus(q, size, size * 0.3);
    if (shape == SHAPE_CYLINDER) return sdCylinder(q, size * 0.5, size);
    if (shape == SHAPE_PLANE) return q.y;
    return customHit(q / size, t).d * size;
}

// The object world() last found nearest; a global because Hit is the code's own struct and has no room for it.
int nearest;

Hit world(vec3 p, float t) {
    Hit best = Hit(1e9, MATTE, 0.0, 1.0, 0.0);
    nearest = -1;

    for (int i = 0; i < MAX_OBJECTS; i++) {
        if (i >= uCount) break;

        vec4 place = uObjects[i * 3];
        vec4 look = uObjects[i * 3 + 1];
        vec4 more = uObjects[i * 3 + 2];
        vec3 q = turned(p - place.xyz, more.x);
        int shape = int(look.x + 0.5);

        Hit candidate = Hit(0.0, int(look.y + 0.5), look.z, look.w, more.y);

        if (shape == SHAPE_CODE) {
            candidate = customHit(q / place.w, t);
            candidate.d *= place.w;
        } else {
            candidate.d = shapeDistance(shape, q, place.w, t);
        }

        if (candidate.d < best.d) {
            best = candidate;
            nearest = i;
        }
    }

    return best;
}

vec3 normalAt(vec3 p, float t) {
    vec2 e = vec2(0.0005, -0.0005);
    return normalize(
        e.xyy * world(p + e.xyy, t).d + e.yyx * world(p + e.yyx, t).d +
        e.yxy * world(p + e.yxy, t).d + e.xxx * world(p + e.xxx, t).d
    );
}

const int STEPS = 160;
const float FAR = 60.0;

bool march(vec3 origin, vec3 direction, float t, float far, out float travelled, out Hit found, out int which) {
    travelled = 0.001;
    which = -1;

    for (int i = 0; i < STEPS; i++) {
        vec3 p = origin + direction * travelled;
        Hit h = world(p, t);
        float d = abs(h.d);

        if (d < 0.003 * max(1.0, travelled)) {
            found = h;
            which = nearest;
            return true;
        }

        travelled += d * 0.9;

        if (travelled > far) break;
    }

    return false;
}

uint seed;

uint hashed(uint x) {
    x ^= x >> 16;
    x *= 0x7feb352du;
    x ^= x >> 15;
    x *= 0x846ca68bu;
    x ^= x >> 16;
    return x;
}

float random() {
    seed = hashed(seed);
    return float(seed) / 4294967296.0;
}

vec3 cosineAround(vec3 n) {
    float u = random();
    float v = random();
    float r = sqrt(u);
    float a = 2.0 * PI * v;
    vec3 side = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
    vec3 other = cross(n, side);
    return normalize(side * r * cos(a) + other * r * sin(a) + n * sqrt(1.0 - u));
}

vec3 sky(vec3 direction) {
    float up = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 gradient = mix(colourAt(0.15), colourAt(0.9), up) * uSky;
    float sun = pow(max(dot(direction, uSun), 0.0), 600.0) * uSunPower * 40.0;
    return gradient + vec3(sun);
}

bool shadowed(vec3 origin, float t) {
    float travelled;
    Hit found;
    int which;
    return march(origin, uSun, t, FAR, travelled, found, which) && found.material != GLASS;
}

// A sphere that holds every glowing part of an object, radius 0 for none a cone can hold: a plane, or code with no bounds().
vec4 lightSphere(int i, float t) {
    vec4 place = uObjects[i * 3];
    vec4 look = uObjects[i * 3 + 1];
    int shape = int(look.x + 0.5);

    if (shape == SHAPE_CODE) {
        vec4 b = codeBounds(t);
        return vec4(place.xyz + turned(b.xyz * place.w, -uObjects[i * 3 + 2].x), b.w * place.w);
    }

    if (int(look.y + 0.5) != LIGHT) return vec4(0.0);
    if (shape == SHAPE_SPHERE) return vec4(place.xyz, place.w);
    if (shape == SHAPE_BOX) return vec4(place.xyz, place.w * 1.7321);
    if (shape == SHAPE_TORUS) return vec4(place.xyz, place.w * 1.3);
    if (shape == SHAPE_CYLINDER) return vec4(place.xyz, place.w * 1.1181);
    return vec4(0.0);
}

bool sampleable(int i, float t) {
    return lightSphere(i, t).w > 0.0;
}

// One light, picked at random, through the cone that bounds it; returns the one it sampled, whose glow a bounce that then meets it must not add again.
int sampleLight(vec3 origin, vec3 normal, float t, inout vec3 light, vec3 carried) {
    int count = 0;
    for (int i = 0; i < MAX_OBJECTS; i++) {
        if (i >= uCount) break;
        if (sampleable(i, t)) count++;
    }

    if (count == 0) return -1;

    int pick = min(int(random() * float(count)), count - 1);
    int chosen = -1;
    for (int i = 0; i < MAX_OBJECTS; i++) {
        if (i >= uCount) break;
        if (sampleable(i, t)) {
            if (pick == 0) {
                chosen = i;
                break;
            }
            pick--;
        }
    }

    vec4 sphere = lightSphere(chosen, t);
    float reach = sphere.w;
    vec3 toward = sphere.xyz - origin;
    float away = length(toward);

    if (away <= reach * 1.001) return -1;

    float cosMax = sqrt(1.0 - (reach * reach) / (away * away));
    float cosine = 1.0 - random() * (1.0 - cosMax);
    float sine = sqrt(max(0.0, 1.0 - cosine * cosine));
    float a = 2.0 * PI * random();
    vec3 axis = toward / away;
    vec3 side = normalize(abs(axis.y) < 0.99 ? cross(axis, vec3(0.0, 1.0, 0.0)) : cross(axis, vec3(1.0, 0.0, 0.0)));
    vec3 other = cross(axis, side);
    vec3 direction = normalize(axis * cosine + (side * cos(a) + other * sin(a)) * sine);
    float facing = dot(normal, direction);

    if (facing > 0.0) {
        float travelled;
        Hit found;
        int which;

        if (march(origin, direction, t, away + reach, travelled, found, which) && which == chosen) {
            vec3 glow = colourAt(found.tint) * found.glow;
            light += carried * glow * facing * 2.0 * (1.0 - cosMax) * float(count);
        }
    }

    return chosen;
}

float fresnel(float cosine, float ratio) {
    float r = (1.0 - ratio) / (1.0 + ratio);
    r *= r;
    return r + (1.0 - r) * pow(1.0 - cosine, 5.0);
}

vec3 traced(vec3 origin, vec3 direction, float t) {
    vec3 light = vec3(0.0);
    vec3 carried = vec3(1.0);
    bool direct = true;
    int sampled = -1;

    for (int bounce = 0; bounce < 8; bounce++) {
        if (bounce >= uBounces) break;

        float travelled;
        Hit h;
        int which;

        if (!march(origin, direction, t, FAR, travelled, h, which)) {
            light += carried * (direct ? sky(direction) : sky(direction) - vec3(pow(max(dot(direction, uSun), 0.0), 600.0) * uSunPower * 40.0));
            break;
        }

        vec3 p = origin + direction * travelled;
        vec3 n = normalAt(p, t);
        vec3 albedo = colourAt(h.tint);
        bool inside = dot(n, direction) > 0.0;
        vec3 facing = inside ? -n : n;

        if (h.material == LIGHT) {
            if (which != sampled) light += carried * albedo * h.glow;
            break;
        }

        sampled = -1;

        if (h.material == GLASS) {
            float ratio = inside ? 1.5 : 1.0 / 1.5;
            float cosine = min(dot(-direction, facing), 1.0);
            vec3 bent = refract(direction, facing, ratio);
            bool reflects = dot(bent, bent) < 0.5 || random() < fresnel(cosine, ratio);
            direction = normalize(reflects ? reflect(direction, facing) : bent);
            direction = normalize(direction + h.rough * 0.3 * (cosineAround(direction) - direction));
            origin = p + (reflects ? facing : -facing) * 0.006;
            carried *= mix(vec3(1.0), albedo, 0.35);
            direct = true;
        } else {
            bool specular =
                h.material == METAL ||
                (h.material == GLOSS && random() < fresnel(max(dot(-direction, facing), 0.0), 1.0 / 1.5) + 0.04);
            origin = p + facing * 0.006;

            if (specular) {
                vec3 mirrored = reflect(direction, facing);
                direction = normalize(mix(mirrored, cosineAround(facing), h.rough * h.rough));
                if (dot(direction, facing) <= 0.0) direction = mirrored;
                carried *= h.material == METAL ? albedo : vec3(1.0);
                direct = h.rough < 0.2;
            } else {
                float lit = max(dot(facing, uSun), 0.0);
                if (lit > 0.0 && uSunPower > 0.0 && !shadowed(origin, t)) {
                    light += carried * albedo * lit * uSunPower;
                }
                sampled = sampleLight(origin, facing, t, light, carried * albedo);
                direction = cosineAround(facing);
                carried *= albedo;
                direct = false;
            }
        }

        if (bounce > 2) {
            float keep = clamp(max(carried.r, max(carried.g, carried.b)), 0.05, 1.0);
            if (random() > keep) break;
            carried /= keep;
        }
    }

    return light;
}

vec3 orbited(Camera c) {
    vec3 pole = normalize(c.up);
    vec3 offset = c.eye - c.target;
    float reach = length(offset);
    vec3 level = offset - dot(offset, pole) * pole;
    vec3 ahead = length(level) > 1e-5 ? normalize(level) : normalize(cross(pole, vec3(0.0, 0.0, 1.0) + pole.yzx));
    vec3 aside = cross(pole, ahead);
    float elevation = clamp(asin(clamp(dot(offset, pole) / reach, -1.0, 1.0)) + uOrbit.y, -PITCH_LIMIT, PITCH_LIMIT);
    vec3 around = cos(uOrbit.x) * ahead + sin(uOrbit.x) * aside;

    return c.target + (cos(elevation) * around + sin(elevation) * pole) * reach * uOrbit.z;
}

void main() {
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    Camera c = view(uPlayhead);
    vec3 eye = orbited(c);
    vec3 forward = normalize(c.target - eye);
    vec3 side = cross(forward, normalize(c.up));
    side = length(side) > 1e-5 ? normalize(side) : normalize(cross(forward, forward.yzx + vec3(0.0, 0.0, 1.0)));
    vec3 up = cross(side, forward);
    float lens = tan(radians(uFov) * 0.5);
    float shorter = min(uResolution.x, uResolution.y);
    vec3 sum = vec3(0.0);

    for (int i = 0; i < 64; i++) {
        if (i >= uBatch) break;

        // Seeded by the pixel, the sample's index and the moment, so sample n of a moment is always the same.
        seed = hashed(uint(pixel.x) * 1973u + uint(pixel.y) * 9277u + uint(int(uDone) + i) * 26699u + uint(uPlayhead * 65536.0) * 3779u);
        vec2 jitter = vec2(random(), random());
        vec2 at = (gl_FragCoord.xy - 0.5 + jitter - uResolution * 0.5) / (shorter * 0.5);
        vec3 direction = normalize(forward + (side * at.x + up * at.y) * lens);
        sum += traced(eye, direction, uPlayhead);
    }

    vec3 batch = sum / float(uBatch);
    vec3 before = uDone > 0.0 ? texelFetch(uPrevious, pixel, 0).rgb : vec3(0.0);
    vec3 mean = (before * uDone + batch * float(uBatch)) / (uDone + float(uBatch));
    colour = vec4(min(mean, vec3(1000.0)), 1.0);
}
