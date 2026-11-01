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
// The index into LENSES: perspective, then orthographic.
uniform int uLens;
// Indices into LATTICES and SPACES, in that order.
uniform int uLattice;
uniform int uSpace;
uniform float uFocus;
// 1 when x goes all the way around (a polar lattice or a wrapping space): the last column meets the first.
uniform int uWrap;

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
#define PASS_FADE 2
#define LENS_ORTHOGRAPHIC 1

struct Camera {
    vec3 eye;
    vec3 target;
    vec3 up;
};

// Prototypes, not dead code: the formula and an adapter defining these are appended after this file.
vec4 point(float x, float y, float t);
Camera view(float t);
vec2 sampled(vec2 uv, float index, float count);
vec3 placed(vec3 p);

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
    // How far the target is: the plane where depth exaggeration is neutral.
    float reach;
};

Eye eyeOf(Camera c) {
    vec3 position = orbited(c);
    vec3 forward = normalize(c.target - position);
    vec3 side = cross(forward, normalize(c.up));
    // Looking straight along up has no side; any perpendicular will do rather than NaN.
    side = length(side) > 1e-5 ? normalize(side) : normalize(cross(forward, forward.yzx + vec3(0.0, 0.0, 1.0)));

    return Eye(position, side, cross(side, forward), forward, length(c.target - position));
}

// Orthographic has no distance to shrink with, so the viewer's dolly scales the picture instead.
float lensScale() {
    return uLens == LENS_ORTHOGRAPHIC ? 1.0 / uOrbit.z : 1.0;
}

mat4 viewProjection(Eye e) {
    mat4 zoom = mat4(lensScale());
    zoom[2][2] = 1.0;
    zoom[3][3] = 1.0;

    return zoom * uProjection * mat4(
        vec4(e.side.x, e.above.x, -e.forward.x, 0.0),
        vec4(e.side.y, e.above.y, -e.forward.y, 0.0),
        vec4(e.side.z, e.above.z, -e.forward.z, 0.0),
        vec4(-dot(e.side, e.position), -dot(e.above, e.position), dot(e.forward, e.position), 1.0)
    );
}

const float HORIZON = 50.0;

// The inverse of the projection for one screen point: x_ndc = sx * x / -z, so x = x_ndc / sx at depth 1.
void aim(Eye e) {
    vec3 across = e.side * (uPointer.x / (uProjection[0][0] * lensScale()))
        + e.above * (uPointer.y / (uProjection[1][1] * lensScale()));

    // Orthographic rays are parallel and start under the cursor; perspective ones fan out from the eye.
    pointerOrigin = uLens == LENS_ORTHOGRAPHIC ? e.position + across : e.position;
    pointerDirection = uLens == LENS_ORTHOGRAPHIC ? e.forward : normalize(e.forward + across);

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
// Straight lines bend in a curved space, so each is drawn as this many pieces, mapped one by one.
const int AXIS_PIECES = 48;
const int AXIS_LINES = 7;
const int CURVE_VERTICES = AXIS_LINES * AXIS_PIECES * 2;
const vec4 AXIS_COLORS[3] = vec4[3](
    vec4(0.85, 0.24, 0.2, 0.9),
    vec4(0.25, 0.65, 0.3, 0.9),
    vec4(0.2, 0.45, 0.9, 0.9)
);
const vec4 OUTLINE = vec4(0.5, 0.5, 0.5, 0.45);
const vec3 AXES[3] = vec3[3](vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0));
const vec3 ACROSS[3] = vec3[3](vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), vec3(1.0, 0.0, 0.0));
const float TICKS[4] = float[4](-1.0, -0.5, 0.5, 1.0);
const vec3 SQUARE[5] = vec3[5](
    vec3(-1.0, -1.0, 0.0), vec3(1.0, -1.0, 0.0), vec3(1.0, 1.0, 0.0), vec3(-1.0, 1.0, 0.0), vec3(-1.0, -1.0, 0.0)
);

// Where line `line` runs, from `from` to `to`: the three axes, then the four sides of the z = 0 square.
void axisLine(int line, out vec3 from, out vec3 to) {
    if (line < 3) {
        // x goes around in a wrapping space, and past +-1 it would lap itself.
        float reach = line == 0 && uWrap == 1 ? 1.0 : AXIS_REACH;
        from = -AXES[line] * reach;
        to = AXES[line] * reach;

        return;
    }

    from = SQUARE[line - 3];
    to = SQUARE[line - 2];
}

// The axes pass: CURVE_VERTICES of mapped line pieces, then 12 ticks of two each. Every point goes through
// placed(), so the axes show the space the formula is read in, not the world it ends up in.
vec3 axisVertex(int id) {
    if (id < CURVE_VERTICES) {
        int line = id / (AXIS_PIECES * 2);
        int piece = (id % (AXIS_PIECES * 2)) / 2;
        float along = float(piece + id % 2) / float(AXIS_PIECES);
        vec3 from;
        vec3 to;
        axisLine(line, from, to);
        vColor = line < 3 ? AXIS_COLORS[line] : OUTLINE;

        return placed(mix(from, to, along));
    }

    int tick = (id - CURVE_VERTICES) / 2;
    int axis = tick / 4;
    float side = (id - CURVE_VERTICES) % 2 == 0 ? -TICK : TICK;
    vColor = AXIS_COLORS[axis];

    return placed(AXES[axis] * TICKS[tick % 4] + ACROSS[axis] * side);
}

const ivec2 LINE_CORNERS[4] = ivec2[4](ivec2(0, 0), ivec2(1, 0), ivec2(0, 0), ivec2(0, 1));
const ivec2 QUAD_CORNERS[6] = ivec2[6](
    ivec2(0, 0), ivec2(1, 0), ivec2(0, 1),
    ivec2(0, 1), ivec2(1, 0), ivec2(1, 1)
);

// x wraps when uWrap is set, so lines and triangles bridge the last column to the first; y never does.
ivec2 latticePoint(int id, int side) {
    if (uMode == MODE_DOTS) {
        return ivec2(id / side, id % side);
    }

    if (uMode == MODE_LINES) {
        int index = id / 4;
        ivec2 corner = ivec2(index / side, index % side) + LINE_CORNERS[id % 4];

        return ivec2(uWrap == 1 ? corner.x % side : min(corner.x, side - 1), min(corner.y, side - 1));
    }

    int rows = side - 1;
    int cell = id / 6;
    ivec2 corner = ivec2(cell / rows, cell % rows) + QUAD_CORNERS[id % 6];

    return ivec2(uWrap == 1 ? corner.x % side : corner.x, corner.y);
}

#define LATTICE_POLAR 1
#define LATTICE_HEX 2
#define LATTICE_JITTER 3

#define SPACE_POLAR 1
#define SPACE_CYLINDRICAL 2
#define SPACE_SPHERICAL 3

// Stable per cell, so a jittered lattice holds still from frame to frame.
vec2 jitterOf(vec2 cell) {
    return fract(sin(vec2(dot(cell, vec2(12.9898, 78.233)), dot(cell, vec2(39.3468, 11.135)))) * 43758.5453) - 0.5;
}

// Focus bunches samples towards the middle (above 1) or the edges (below 1), keeping their order.
float focused(float u) {
    return sign(u) * pow(abs(u), uFocus);
}

// Set in main() before sampling, for the lattices that need the integer cell and its size.
vec2 latticeCell;
float latticeStep;

vec2 builtinLattice(vec2 uv) {
    if (uLattice == LATTICE_POLAR) {
        float angle = uv.x * PI;
        float radius = pow((uv.y + 1.0) * 0.5, uFocus);

        return radius * vec2(cos(angle), sin(angle));
    }

    vec2 at = vec2(focused(uv.x), focused(uv.y));

    if (uLattice == LATTICE_HEX) {
        return at + vec2(mod(latticeCell.y, 2.0) * latticeStep * 0.5, 0.0);
    }

    if (uLattice == LATTICE_JITTER) {
        return at + jitterOf(latticeCell) * latticeStep * 0.9;
    }

    return at;
}

// x is always the coordinate that goes around, so a flat formula wraps without being rewritten.
vec3 builtinSpace(vec3 v) {
    if (uSpace == SPACE_POLAR) {
        float angle = v.x * PI;
        float radius = (v.y + 1.0) * 0.5;

        return vec3(radius * cos(angle), radius * sin(angle), v.z);
    }

    if (uSpace == SPACE_CYLINDRICAL) {
        float angle = v.x * PI;
        float radius = 0.35 + 0.5 * v.z;

        return vec3(radius * sin(angle), v.y, radius * cos(angle));
    }

    if (uSpace == SPACE_SPHERICAL) {
        float longitude = v.x * PI;
        float latitude = v.y * PI * 0.5;
        float radius = 0.55 + 0.4 * v.z;

        return radius * vec3(cos(latitude) * sin(longitude), sin(latitude), cos(latitude) * cos(longitude));
    }

    return v;
}

void main() {
    // camera() runs before this, so a camera that reads pointer sees it unset: aiming needs the camera.
    Eye eye = eyeOf(view(uPlayhead));
    mat4 projected = viewProjection(eye);

    if (uPass == PASS_FADE) {
        // One triangle that covers the whole viewport.
        vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
        gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
        gl_PointSize = 1.0;
        vPointSize = 1.0;
        vTint = 0.0;
        vPosition = vec3(0.0);
        vColor = vec4(0.0);

        return;
    }

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
    ivec2 index = latticePoint(gl_VertexID, side);
    ivec2 cell = index - uDimension;

    // Cell centres: plain i / d spans [-1, 1) and shifts the lattice half a step.
    float d = float(uDimension);
    vec2 uv = (vec2(cell) + 0.5) / d;
    latticeCell = vec2(index);
    latticeStep = 1.0 / d;
    vec2 at = sampled(uv, float(index.x * side + index.y), float(side * side));
    vec4 p = point(at.x, at.y, uPlayhead);
    vec3 v = placed(p.xyz);

    gl_Position = projected * vec4(v, 1.0);

    // Zoom scales a dot in proportion; only nearness to the target plane is exaggerated by depth.
    // Raising the camera's whole distance to that power made a zoomed-out sketch's dots vanish.
    float zoom = uLens == LENS_ORTHOGRAPHIC ? lensScale() : uReference / max(eye.reach, 1e-3);
    float nearness = uLens == LENS_ORTHOGRAPHIC ? 1.0 : eye.reach / max(gl_Position.w, 1e-3);
    float base = uBaseSize * uPixelRatio * zoom;
    // Capped: a camera skimming the ground would otherwise blow its nearest dots up to fill the canvas.
    float size = base * min(pow(nearness, 3.0 * uDepthScalar), 3.0);
    gl_PointSize = size;

    vPointSize = size;
    vTint = p.w;
    vPosition = v;
}
