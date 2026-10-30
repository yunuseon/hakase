#version 300 es
precision highp float;

#define PI 3.141592653589793

#define MODE_DOTS 0
#define MODE_LINES 1

uniform int uDimension;
uniform int uMode;
uniform float uPlayhead;
uniform float uDepthScalar;
uniform float uBaseSize;
uniform float uPixelRatio;
uniform mat4 uProjection;
// The viewer's own drag on top of the camera: yaw, pitch, and distance as a multiple.
uniform vec3 uOrbit;
uniform float uReference;
uniform int uPass;

// Named plainly, not uX: these are read by formulas, so they are part of the formula's language.
uniform float k1;
uniform float k2;
uniform float k3;
uniform float k4;
uniform float pointerDown;

// The mouse over the canvas in clip space; formulas read the world-space globals below instead.
uniform vec2 uPointer;

// Globals, not uniforms: main() fills them from the camera before the formula runs.
vec2 pointer;
vec3 pointerOrigin;
vec3 pointerDirection;
float pointerOnGround;

out vec4 vColor;
out float vTint;
out float vPointSize;
out vec3 vPosition;

#define PASS_AXES 1

struct Camera {
    vec3 eye;
    vec3 target;
    vec3 up;
};

// Prototypes, not dead code: the formula and an adapter defining these are appended after this file.
vec4 point(float x, float y, float t);
Camera view(float t);

const float PITCH_LIMIT = 1.56;

// Turns the camera around its target, with its own up as the pole, so a scripted camera orbits too.
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

struct Eye {
    vec3 position;
    vec3 side;
    vec3 above;
    vec3 forward;
};

Eye eyeOf(Camera c) {
    vec3 position = orbited(c);
    vec3 forward = normalize(c.target - position);
    vec3 side = cross(forward, normalize(c.up));
    // Looking straight along up has no side; any perpendicular will do rather than NaN.
    side = length(side) > 1e-5 ? normalize(side) : normalize(cross(forward, forward.yzx + vec3(0.0, 0.0, 1.0)));

    return Eye(position, side, cross(side, forward), forward);
}

mat4 viewProjection(Eye e) {
    return uProjection * mat4(
        vec4(e.side.x, e.above.x, -e.forward.x, 0.0),
        vec4(e.side.y, e.above.y, -e.forward.y, 0.0),
        vec4(e.side.z, e.above.z, -e.forward.z, 0.0),
        vec4(-dot(e.side, e.position), -dot(e.above, e.position), dot(e.forward, e.position), 1.0)
    );
}

const float HORIZON = 50.0;

// The inverse of the projection for one screen point: x_ndc = sx * x / -z, so x = x_ndc / sx at depth 1.
void aim(Eye e) {
    pointerOrigin = e.position;
    pointerDirection = normalize(
        e.forward + e.side * (uPointer.x / uProjection[0][0]) + e.above * (uPointer.y / uProjection[1][1])
    );

    float along = -pointerOrigin.z / pointerDirection.z;
    pointerOnGround = abs(pointerDirection.z) > 1e-4 && along > 0.0 ? 1.0 : 0.0;
    // A ray that never meets the ground points at the horizon rather than jumping to infinity.
    vec3 hit = pointerOrigin + pointerDirection * (pointerOnGround > 0.5 ? min(along, HORIZON) : HORIZON);
    pointer = hit.xy;
}

float pointerDistance(vec3 p) {
    return length(cross(p - pointerOrigin, pointerDirection));
}

const float AXIS_REACH = 1.25;
const float TICK = 0.04;
const int FRAME_VERTICES = 14;
const vec3 FRAME[FRAME_VERTICES] = vec3[FRAME_VERTICES](
    vec3(-AXIS_REACH, 0.0, 0.0), vec3(AXIS_REACH, 0.0, 0.0),
    vec3(0.0, -AXIS_REACH, 0.0), vec3(0.0, AXIS_REACH, 0.0),
    vec3(0.0, 0.0, -AXIS_REACH), vec3(0.0, 0.0, AXIS_REACH),
    vec3(-1.0, -1.0, 0.0), vec3(1.0, -1.0, 0.0),
    vec3(1.0, -1.0, 0.0), vec3(1.0, 1.0, 0.0),
    vec3(1.0, 1.0, 0.0), vec3(-1.0, 1.0, 0.0),
    vec3(-1.0, 1.0, 0.0), vec3(-1.0, -1.0, 0.0)
);
const vec3 AXES[3] = vec3[3](vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0));
const vec3 ACROSS[3] = vec3[3](vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), vec3(1.0, 0.0, 0.0));
const vec4 AXIS_COLORS[3] = vec4[3](
    vec4(0.85, 0.24, 0.2, 0.9),
    vec4(0.25, 0.65, 0.3, 0.9),
    vec4(0.2, 0.45, 0.9, 0.9)
);
const vec4 OUTLINE = vec4(0.5, 0.5, 0.5, 0.45);
const float TICKS[4] = float[4](-1.0, -0.5, 0.5, 1.0);

// The axes pass: 14 vertices of axes and the z = 0 square, then 12 ticks of two each.
vec3 axisVertex(int id) {
    if (id < FRAME_VERTICES) {
        int segment = id / 2;
        vColor = segment < 3 ? AXIS_COLORS[segment] : OUTLINE;

        return FRAME[id];
    }

    int tick = (id - FRAME_VERTICES) / 2;
    int axis = tick / 4;
    float side = (id - FRAME_VERTICES) % 2 == 0 ? -TICK : TICK;
    vColor = AXIS_COLORS[axis];

    return AXES[axis] * TICKS[tick % 4] + ACROSS[axis] * side;
}

const ivec2 LINE_CORNERS[4] = ivec2[4](ivec2(0, 0), ivec2(1, 0), ivec2(0, 0), ivec2(0, 1));
const ivec2 QUAD_CORNERS[6] = ivec2[6](
    ivec2(0, 0), ivec2(1, 0), ivec2(0, 1),
    ivec2(0, 1), ivec2(1, 0), ivec2(1, 1)
);

ivec2 latticePoint(int id, int side) {
    if (uMode == MODE_DOTS) {
        return ivec2(id / side, id % side);
    }

    if (uMode == MODE_LINES) {
        int index = id / 4;
        return min(ivec2(index / side, index % side) + LINE_CORNERS[id % 4], side - 1);
    }

    int cell = id / 6;
    int cells = side - 1;

    return ivec2(cell / cells, cell % cells) + QUAD_CORNERS[id % 6];
}

void main() {
    // camera() runs before this, so a camera that reads pointer sees it unset: aiming needs the camera.
    Eye eye = eyeOf(view(uPlayhead));
    mat4 projected = viewProjection(eye);

    if (uPass == PASS_AXES) {
        gl_Position = projected * vec4(axisVertex(gl_VertexID), 1.0);
        gl_PointSize = 1.0;
        vPointSize = 1.0;
        vTint = 0.0;
        vPosition = vec3(0.0);

        return;
    }

    aim(eye);
    vColor = vec4(0.0);
    int side = 2 * uDimension;
    ivec2 cell = latticePoint(gl_VertexID, side) - uDimension;

    // Cell centres: plain i / d spans [-1, 1) and shifts the lattice half a step.
    float d = float(uDimension);
    vec4 p = point((float(cell.x) + 0.5) / d, (float(cell.y) + 0.5) / d, uPlayhead);
    vec3 v = p.xyz;

    gl_Position = projected * vec4(v, 1.0);

    // Relative to the default camera distance, not the current one, so dollying in grows the dots.
    float nearness = uReference / max(gl_Position.w, 1e-3);
    float base = 0.6 * uBaseSize * uPixelRatio;
    // Capped: a camera skimming the ground would otherwise blow its nearest dots up to fill the canvas.
    float size = min(base * pow(nearness, 3.0 * uDepthScalar), 3.0 * base);
    gl_PointSize = size;

    vPointSize = size;
    vTint = p.w;
    vPosition = v;
}
