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
// One texel per lattice point: the state evolve() left there on the step before.
uniform sampler2D uState;

// Globals, not uniforms: main() fills them from the camera before the formula runs.
vec2 pointer;
vec3 pointerOrigin;
vec3 pointerDirection;
float pointerOnGround;
// Which lattice point state() and neighbour() read, set before the formula or evolve() runs.
ivec2 stateIndex;

out vec4 vColor;
out float vTint;
out float vPointSize;
out vec3 vPosition;
flat out vec4 vState;

#define PASS_AXES 1
#define PASS_FADE 2
#define PASS_STEP 3
#define PASS_SEED 4
#define LENS_ORTHOGRAPHIC 1

#define SPACE_CARTESIAN 0
#define SPACE_POLAR 1
#define SPACE_CYLINDRICAL 2
#define SPACE_SPHERICAL 3

// The radius z = 0 maps to, which is also the sheet the pointer is read on.
const float CYLINDER_RADIUS = 0.35;
const float SPHERE_RADIUS = 0.55;

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
bool ownSpace();
vec4 evolved(float x, float y, float t);
vec4 seeded(float x, float y);

vec4 state() {
    return texelFetch(uState, stateIndex, 0);
}

// Wraps at the edges, so a pattern that leaves one side comes back on the other.
vec4 neighbour(int dx, int dy) {
    int side = 2 * uDimension;

    return texelFetch(uState, ivec2((stateIndex.x + dx + side) % side, (stateIndex.y + dy + side) % side), 0);
}

// This point's place on the state grid, -1 to 1: x and y are where it is drawn, which lattice and focus move.
vec2 cell() {
    return (vec2(stateIndex - uDimension) + 0.5) / float(uDimension);
}

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

    // A formula's own space() cannot be inverted, so it reads the ground point; cartesian needs no inverse.
    if (ownSpace() || uSpace == SPACE_CARTESIAN) {
        return;
    }

    if (uSpace == SPACE_POLAR) {
        pointer = vec2(atan(hit.y, hit.x) / PI, 2.0 * length(hit.xy) - 1.0);

        return;
    }

    // The sheet is a cylinder around y or a ball, so the ray meets a quadratic; a miss takes its nearest approach.
    bool cylinder = uSpace == SPACE_CYLINDRICAL;
    vec3 keep = cylinder ? vec3(1.0, 0.0, 1.0) : vec3(1.0);
    float radius = cylinder ? CYLINDER_RADIUS : SPHERE_RADIUS;
    vec3 o = pointerOrigin * keep;
    vec3 d = pointerDirection * keep;
    float a = max(dot(d, d), 1e-8);
    float b = dot(o, d);
    float disc = b * b - a * (dot(o, o) - radius * radius);
    float near = (-b - sqrt(max(disc, 0.0))) / a;
    float far = (-b + sqrt(max(disc, 0.0))) / a;
    float t = disc >= 0.0 && far > 0.0 ? (near > 0.0 ? near : far) : max(-b / a, 0.0);
    vec3 at = pointerOrigin + pointerDirection * t;
    pointerOnGround = disc >= 0.0 && far > 0.0 ? 1.0 : 0.0;

    if (cylinder) {
        pointer = vec2(atan(at.x, at.z) / PI, at.y);

        return;
    }

    vec3 onBall = normalize(at) * SPHERE_RADIUS;
    pointer = vec2(atan(onBall.x, onBall.z) / PI, asin(clamp(onBall.y / SPHERE_RADIUS, -1.0, 1.0)) / (PI * 0.5));
}

float pointerDistance(vec3 p) {
    return length(cross(p - pointerOrigin, pointerDirection));
}

// In the world, through whatever space the sketch reads its formula in, a formula's own space() included.
float pointerDistance(float x, float y) {
    return pointerDistance(placed(vec3(x, y, 0.0)));
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
        float radius = CYLINDER_RADIUS + 0.5 * v.z;

        return vec3(radius * sin(angle), v.y, radius * cos(angle));
    }

    if (uSpace == SPACE_SPHERICAL) {
        float longitude = v.x * PI;
        float latitude = v.y * PI * 0.5;
        float radius = SPHERE_RADIUS + 0.4 * v.z;

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
    vState = vec4(0.0);
    int side = 2 * uDimension;
    bool stepping = uPass == PASS_STEP || uPass == PASS_SEED;
    // A step draws one point per lattice point, in index order, not the mode's primitive.
    ivec2 index = stepping ? ivec2(gl_VertexID / side, gl_VertexID % side) : latticePoint(gl_VertexID, side);
    ivec2 cell = index - uDimension;
    stateIndex = index;

    // Cell centres: plain i / d spans [-1, 1) and shifts the lattice half a step.
    float d = float(uDimension);
    vec2 uv = (vec2(cell) + 0.5) / d;
    latticeCell = vec2(index);
    latticeStep = 1.0 / d;
    vec2 at = sampled(uv, float(index.x * side + index.y), float(side * side));

    if (stepping) {
        vState = uPass == PASS_STEP ? evolved(at.x, at.y, uPlayhead) : seeded(at.x, at.y);
        // The centre of this point's own texel in the state texture, which is the viewport.
        gl_Position = vec4((vec2(index) + 0.5) / float(side) * 2.0 - 1.0, 0.0, 1.0);
        gl_PointSize = 1.0;
        vPointSize = 1.0;
        vTint = 0.0;
        vPosition = vec3(0.0);

        return;
    }

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
