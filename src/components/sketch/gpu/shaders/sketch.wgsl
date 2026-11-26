const PI = 3.141592653589793;

const MODE_DOTS = 0;
const MODE_LINES = 1;
const MODE_SURFACE = 2;
const LENS_ORTHOGRAPHIC = 1;
const SPACE_CARTESIAN = 0;
const SPACE_POLAR = 1;
const SPACE_CYLINDRICAL = 2;
const SPACE_SPHERICAL = 3;
const LATTICE_POLAR = 1;
const LATTICE_HEX = 2;
const LATTICE_JITTER = 3;

// The radius z = 0 maps to, which is also the sheet the pointer is read on.
const CYLINDER_RADIUS = 0.35;
const SPHERE_RADIUS = 0.55;
const PITCH_LIMIT = 1.56;
const HORIZON = 50.0;
const SMALL_DOT = 6.0;
const LIGHT = vec3f(-0.40562, 0.50702, 0.76053);

// Must match frameData in sketch-program.ts, field for field.
struct Frame {
    projection: mat4x4f,
    // yaw, pitch, distance as a multiple
    orbit: vec4f,
    // clip x, clip y, pressed, playhead
    pointer: vec4f,
    // target width, height, dot scale, pixel ratio
    view: vec4f,
    // dot size, depth, reference distance, focus
    sizes: vec4f,
    // colour shift, fade, paint frame, paint frames
    look: vec4f,
    // mode, lens, lattice, space
    modes: vec4i,
    // dimension, wrap, paint fades, unused
    flags: vec4i,
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var palette: texture_2d<f32>;
@group(0) @binding(2) var paintLayers: texture_2d_array<f32>;
@group(0) @binding(3) var nearest: sampler;
@group(0) @binding(4) var bilinear: sampler;

// Named plainly: formulas read them, so they are part of the formula's language, and each is its own binding so the compiler can say which a formula reads.
@group(1) @binding(0) var<uniform> k1: f32;
@group(1) @binding(1) var<uniform> k2: f32;
@group(1) @binding(2) var<uniform> k3: f32;
@group(1) @binding(3) var<uniform> k4: f32;

@group(2) @binding(0) var<storage, read_write> points: array<vec4f>;
@group(2) @binding(1) var<storage, read> drawn: array<vec4f>;

@group(3) @binding(0) var<storage, read> stateIn: array<vec4f>;
@group(3) @binding(1) var<storage, read_write> stateOut: array<vec4f>;

struct Camera {
    eye: vec3f,
    centre: vec3f,
    up: vec3f,
};

// Filled before the formula runs, from the camera: aiming needs it, so a camera that reads them sees them unset.
var<private> pointer: vec2f;
var<private> pointerOrigin: vec3f;
var<private> pointerDirection: vec3f;
var<private> pointerOnGround: f32;
var<private> pointerDown: f32;
var<private> stateIndex: vec2i;
var<private> latticeCell: vec2f;
var<private> latticeStep: f32;

fn floorMod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

fn dimension() -> i32 {
    return frame.flags.x;
}

fn playhead() -> f32 {
    return frame.pointer.w;
}

// The painting under p, 0 to 1: -1..1 covers it, its top row at y = 1.
fn paint(p: vec2f) -> f32 {
    let uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
    let layer = floor(frame.look.z);
    let here = textureSampleLevel(paintLayers, bilinear, uv, i32(layer), 0.0).r;

    if (frame.flags.z == 0) {
        return here;
    }

    let next = textureSampleLevel(
        paintLayers,
        bilinear,
        uv,
        i32(floorMod(layer + 1.0, max(frame.look.w, 1.0))),
        0.0,
    ).r;

    return mix(here, next, smoothstep(0.0, 1.0, fract(frame.look.z)));
}

fn paintAt(x: f32, y: f32) -> f32 {
    return paint(vec2f(x, y));
}

fn stateSlot(at: vec2i) -> i32 {
    return at.y * 2 * dimension() + at.x;
}

fn state() -> vec4f {
    return stateIn[stateSlot(stateIndex)];
}

// Wraps at the edges, so a pattern that leaves one side comes back on the other.
fn neighbour(dx: i32, dy: i32) -> vec4f {
    let side = 2 * dimension();

    return stateIn[stateSlot(vec2i((stateIndex.x + dx + side) % side, (stateIndex.y + dy + side) % side))];
}

// This point's place on the state grid, -1 to 1: x and y are where it is drawn, which lattice and focus move.
fn cell() -> vec2f {
    return (vec2f(stateIndex - vec2i(dimension())) + 0.5) / f32(dimension());
}

// Turns the camera around its centre, with its own up as the pole, so a scripted camera orbits too.
fn orbited(c: Camera) -> vec3f {
    let pole = normalize(c.up);
    let offset = c.eye - c.centre;
    let reach = length(offset);
    let level = offset - dot(offset, pole) * pole;
    let ahead = select(
        normalize(cross(pole, vec3f(0.0, 0.0, 1.0) + pole.yzx)),
        normalize(level),
        length(level) > 1e-5,
    );
    let aside = cross(pole, ahead);
    let orbit = frame.orbit;
    let elevation = clamp(
        asin(clamp(dot(offset, pole) / reach, -1.0, 1.0)) + orbit.y,
        -PITCH_LIMIT,
        PITCH_LIMIT,
    );
    let around = cos(orbit.x) * ahead + sin(orbit.x) * aside;

    return c.centre + (cos(elevation) * around + sin(elevation) * pole) * reach * orbit.z;
}

struct Eye {
    position: vec3f,
    side: vec3f,
    above: vec3f,
    forward: vec3f,
    // How far the centre is: the plane where depth exaggeration is neutral.
    reach: f32,
};

fn eyeOf(c: Camera) -> Eye {
    let position = orbited(c);
    let forward = normalize(c.centre - position);
    let crossed = cross(forward, normalize(c.up));
    // Looking straight along up has no side; any perpendicular will do rather than NaN.
    let side = select(
        normalize(cross(forward, forward.yzx + vec3f(0.0, 0.0, 1.0))),
        normalize(crossed),
        length(crossed) > 1e-5,
    );

    return Eye(position, side, cross(side, forward), forward, length(c.centre - position));
}

// Orthographic has no distance to shrink with, so the viewer's dolly scales the picture instead.
fn lensScale() -> f32 {
    return select(1.0, 1.0 / frame.orbit.z, frame.modes.y == LENS_ORTHOGRAPHIC);
}

fn viewProjection(e: Eye) -> mat4x4f {
    let s = lensScale();
    let zoom = mat4x4f(
        vec4f(s, 0.0, 0.0, 0.0),
        vec4f(0.0, s, 0.0, 0.0),
        vec4f(0.0, 0.0, 1.0, 0.0),
        vec4f(0.0, 0.0, 0.0, 1.0),
    );

    return zoom * frame.projection * mat4x4f(
        vec4f(e.side.x, e.above.x, -e.forward.x, 0.0),
        vec4f(e.side.y, e.above.y, -e.forward.y, 0.0),
        vec4f(e.side.z, e.above.z, -e.forward.z, 0.0),
        vec4f(-dot(e.side, e.position), -dot(e.above, e.position), dot(e.forward, e.position), 1.0),
    );
}

// The projection is GL's, with depth from -1 to 1; WebGPU keeps 0 to 1.
fn clipOf(v: vec3f, projected: mat4x4f) -> vec4f {
    let c = projected * vec4f(v, 1.0);

    return vec4f(c.xy, 0.5 * (c.z + c.w), c.w);
}

// The inverse of the projection for one screen point: x_ndc = sx * x / -z, so x = x_ndc / sx at depth 1.
fn aim(e: Eye) {
    let screen = frame.pointer.xy;
    let across = e.side * (screen.x / (frame.projection[0][0] * lensScale())) +
        e.above * (screen.y / (frame.projection[1][1] * lensScale()));
    let orthographic = frame.modes.y == LENS_ORTHOGRAPHIC;

    // Orthographic rays are parallel and start under the cursor; perspective ones fan out from the eye.
    pointerOrigin = select(e.position, e.position + across, orthographic);
    pointerDirection = select(normalize(e.forward + across), e.forward, orthographic);

    let along = -pointerOrigin.z / pointerDirection.z;
    pointerOnGround = select(0.0, 1.0, abs(pointerDirection.z) > 1e-4 && along > 0.0);
    // A ray that never meets the ground points at the horizon rather than jumping to infinity.
    let ground = pointerOrigin +
        pointerDirection * select(HORIZON, min(along, HORIZON), pointerOnGround > 0.5);
    pointer = ground.xy;

    let chosen = frame.modes.w;

    // A formula's own space() cannot be inverted, so it reads the ground point; cartesian needs no inverse.
    if (ownSpace() || chosen == SPACE_CARTESIAN) {
        return;
    }

    if (chosen == SPACE_POLAR) {
        pointer = vec2f(atan2(ground.y, ground.x) / PI, 2.0 * length(ground.xy) - 1.0);

        return;
    }

    // The sheet is a cylinder around y or a ball, so the ray meets a quadratic; a miss takes its nearest approach.
    let cylinder = chosen == SPACE_CYLINDRICAL;
    let keep = select(vec3f(1.0), vec3f(1.0, 0.0, 1.0), cylinder);
    let radius = select(SPHERE_RADIUS, CYLINDER_RADIUS, cylinder);
    let o = pointerOrigin * keep;
    let d = pointerDirection * keep;
    let a = max(dot(d, d), 1e-8);
    let b = dot(o, d);
    let disc = b * b - a * (dot(o, o) - radius * radius);
    let near = (-b - sqrt(max(disc, 0.0))) / a;
    let far = (-b + sqrt(max(disc, 0.0))) / a;
    let met = disc >= 0.0 && far > 0.0;
    let reached = pointerOrigin +
        pointerDirection * select(max(-b / a, 0.0), select(far, near, near > 0.0), met);
    pointerOnGround = select(0.0, 1.0, met);

    if (cylinder) {
        pointer = vec2f(atan2(reached.x, reached.z) / PI, reached.y);

        return;
    }

    let onBall = normalize(reached) * SPHERE_RADIUS;
    pointer = vec2f(
        atan2(onBall.x, onBall.z) / PI,
        asin(clamp(onBall.y / SPHERE_RADIUS, -1.0, 1.0)) / (PI * 0.5),
    );
}

fn pointerDistance(p: vec3f) -> f32 {
    return length(cross(p - pointerOrigin, pointerDirection));
}

// In the world, through whatever space the sketch reads its formula in, a formula's own space() included.
fn pointerNear(x: f32, y: f32) -> f32 {
    return pointerDistance(placed(vec3f(x, y, 0.0)));
}

const AXIS_REACH = 1.25;
const TICK = 0.04;
// Straight lines bend in a curved space, so each is drawn as this many pieces, mapped one by one.
const AXIS_PIECES = 48;
// Must match AXIS_VERTICES in sketch-program.ts.
const CURVE_VERTICES = 7 * 48 * 2;
const OUTLINE = vec4f(0.5, 0.5, 0.5, 0.45);

fn axisColour(axis: i32) -> vec4f {
    var colours = array<vec4f, 3>(
        vec4f(0.85, 0.24, 0.2, 0.9),
        vec4f(0.25, 0.65, 0.3, 0.9),
        vec4f(0.2, 0.45, 0.9, 0.9),
    );

    return colours[axis];
}

fn axisDirection(axis: i32) -> vec3f {
    var axes = array<vec3f, 3>(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0));

    return axes[axis];
}

fn axisAcross(axis: i32) -> vec3f {
    var across = array<vec3f, 3>(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), vec3f(1.0, 0.0, 0.0));

    return across[axis];
}

fn squareCorner(index: i32) -> vec3f {
    var square = array<vec3f, 5>(
        vec3f(-1.0, -1.0, 0.0),
        vec3f(1.0, -1.0, 0.0),
        vec3f(1.0, 1.0, 0.0),
        vec3f(-1.0, 1.0, 0.0),
        vec3f(-1.0, -1.0, 0.0),
    );

    return square[index];
}

struct AxisPoint {
    position: vec3f,
    colour: vec4f,
};

// The three axes, then the four sides of the z = 0 square, then 12 ticks. Every point goes through
// placed(), so the axes show the space the formula is read in, not the world it ends up in.
fn axisPoint(id: i32) -> AxisPoint {
    if (id < CURVE_VERTICES) {
        let line = id / (AXIS_PIECES * 2);
        let piece = (id % (AXIS_PIECES * 2)) / 2;
        let along = f32(piece + id % 2) / f32(AXIS_PIECES);

        if (line < 3) {
            // x goes around in a wrapping space, and past +-1 it would lap itself.
            let reach = select(AXIS_REACH, 1.0, line == 0 && frame.flags.y == 1);

            return AxisPoint(
                placed(mix(-axisDirection(line) * reach, axisDirection(line) * reach, along)),
                axisColour(line),
            );
        }

        return AxisPoint(placed(mix(squareCorner(line - 3), squareCorner(line - 2), along)), OUTLINE);
    }

    let tick = (id - CURVE_VERTICES) / 2;
    let axis = tick / 4;
    let side = select(TICK, -TICK, (id - CURVE_VERTICES) % 2 == 0);
    var ticks = array<f32, 4>(-1.0, -0.5, 0.5, 1.0);

    return AxisPoint(placed(axisDirection(axis) * ticks[tick % 4] + axisAcross(axis) * side), axisColour(axis));
}

// x wraps when the seam closes, so lines and triangles bridge the last column to the first; y never does.
fn linePoint(id: i32, side: i32) -> vec2i {
    var corners = array<vec2i, 4>(vec2i(0, 0), vec2i(1, 0), vec2i(0, 0), vec2i(0, 1));
    let index = id / 4;
    let corner = vec2i(index / side, index % side) + corners[id % 4];

    return vec2i(select(min(corner.x, side - 1), corner.x % side, frame.flags.y == 1), min(corner.y, side - 1));
}

fn surfacePoint(id: i32, side: i32) -> vec2i {
    var quad = array<vec2i, 6>(
        vec2i(0, 0),
        vec2i(1, 0),
        vec2i(0, 1),
        vec2i(0, 1),
        vec2i(1, 0),
        vec2i(1, 1),
    );
    let rows = side - 1;
    let index = id / 6;
    let corner = vec2i(index / rows, index % rows) + quad[id % 6];

    return vec2i(select(corner.x, corner.x % side, frame.flags.y == 1), corner.y);
}

// Stable per cell, so a jittered lattice holds still from frame to frame.
fn jitterOf(at: vec2f) -> vec2f {
    return fract(sin(vec2f(dot(at, vec2f(12.9898, 78.233)), dot(at, vec2f(39.3468, 11.135)))) * 43758.5453) - 0.5;
}

// Focus bunches samples towards the middle (above 1) or the edges (below 1), keeping their order.
fn focused(u: f32) -> f32 {
    return sign(u) * pow(abs(u), frame.sizes.w);
}

fn builtinLattice(uv: vec2f) -> vec2f {
    let lattice = frame.modes.z;

    if (lattice == LATTICE_POLAR) {
        let angle = uv.x * PI;
        let radius = pow((uv.y + 1.0) * 0.5, frame.sizes.w);

        return radius * vec2f(cos(angle), sin(angle));
    }

    let at = vec2f(focused(uv.x), focused(uv.y));

    if (lattice == LATTICE_HEX) {
        return at + vec2f(floorMod(latticeCell.y, 2.0) * latticeStep * 0.5, 0.0);
    }

    if (lattice == LATTICE_JITTER) {
        return at + jitterOf(latticeCell) * latticeStep * 0.9;
    }

    return at;
}

// x is always the coordinate that goes around, so a flat formula wraps without being rewritten.
fn builtinSpace(v: vec3f) -> vec3f {
    let chosen = frame.modes.w;

    if (chosen == SPACE_POLAR) {
        let angle = v.x * PI;
        let radius = (v.y + 1.0) * 0.5;

        return vec3f(radius * cos(angle), radius * sin(angle), v.z);
    }

    if (chosen == SPACE_CYLINDRICAL) {
        let angle = v.x * PI;
        let radius = CYLINDER_RADIUS + 0.5 * v.z;

        return vec3f(radius * sin(angle), v.y, radius * cos(angle));
    }

    if (chosen == SPACE_SPHERICAL) {
        let longitude = v.x * PI;
        let latitude = v.y * PI * 0.5;
        let radius = SPHERE_RADIUS + 0.4 * v.z;

        return radius * vec3f(cos(latitude) * sin(longitude), sin(latitude), cos(latitude) * cos(longitude));
    }

    return v;
}

fn begin() {
    pointerDown = frame.pointer.z;
    aim(eyeOf(view(playhead())));
}

// Cell centres: plain i / d spans [-1, 1) and shifts the lattice half a step.
fn sampledAt(index: vec2i) -> vec2f {
    let d = dimension();
    let side = 2 * d;
    stateIndex = index;
    latticeCell = vec2f(index);
    latticeStep = 1.0 / f32(d);

    return sampled((vec2f(index - vec2i(d)) + 0.5) / f32(d), f32(index.x * side + index.y), f32(side * side));
}

@compute @workgroup_size(64)
fn evaluate(@builtin(global_invocation_id) id: vec3u) {
    let side = 2 * dimension();
    let at = i32(id.x);

    if (at >= side * side) {
        return;
    }

    begin();
    let uv = sampledAt(vec2i(at / side, at % side));
    let p = point(uv.x, uv.y, playhead());
    points[at] = vec4f(placed(p.xyz), p.w);
}

@compute @workgroup_size(64)
fn advance(@builtin(global_invocation_id) id: vec3u) {
    let side = 2 * dimension();
    let at = i32(id.x);

    if (at >= side * side) {
        return;
    }

    begin();
    let index = vec2i(at / side, at % side);
    let uv = sampledAt(index);
    stateOut[stateSlot(index)] = evolved(uv.x, uv.y, playhead());
}

@compute @workgroup_size(64)
fn seed(@builtin(global_invocation_id) id: vec3u) {
    let side = 2 * dimension();
    let at = i32(id.x);

    if (at >= side * side) {
        return;
    }

    begin();
    let index = vec2i(at / side, at % side);
    let uv = sampledAt(index);
    stateOut[stateSlot(index)] = seeded(uv.x, uv.y);
}

struct Shown {
    @builtin(position) position: vec4f,
    @location(0) local: vec2f,
    @location(1) tint: f32,
    @location(2) size: f32,
    @location(3) world: vec3f,
    @location(4) colour: vec4f,
};

fn tinted(tint: f32) -> vec3f {
    return textureSampleLevel(palette, nearest, vec2f(clamp(tint + frame.look.x, 0.0, 1.0), 0.5), 0.0).rgb;
}

// One quad per point: WebGPU draws points a pixel wide, whatever size they ask for.
@vertex
fn dotVertex(@builtin(vertex_index) corner: u32, @builtin(instance_index) instance: u32) -> Shown {
    let eye = eyeOf(view(playhead()));
    let here = drawn[instance];
    let clip = clipOf(here.xyz, viewProjection(eye));
    let orthographic = frame.modes.y == LENS_ORTHOGRAPHIC;
    // Zoom scales a dot in proportion; only nearness to the centre's plane is exaggerated by depth.
    let zoom = select(frame.sizes.z / max(eye.reach, 1e-3), lensScale(), orthographic);
    let nearness = select(eye.reach / max(clip.w, 1e-3), 1.0, orthographic);
    // Capped: a camera skimming the ground would otherwise blow its nearest dots up to fill the canvas.
    let size = frame.sizes.x * frame.view.w * zoom * min(pow(nearness, 3.0 * frame.sizes.y), 3.0);
    let local = vec2f(f32(corner & 1u), f32(corner >> 1u)) * 2.0 - 1.0;
    let offset = local * size / frame.view.xy * clip.w;

    return Shown(vec4f(clip.xy + offset, clip.zw), local, here.w, size, here.xyz, vec4f(0.0));
}

@fragment
fn dotFragment(v: Shown) -> @location(0) vec4f {
    let dotScale = frame.view.z;
    let aa = 2.0 * dotScale / max(v.size, dotScale);
    let alpha = 1.0 - smoothstep(1.0 - aa, 1.0, length(v.local));

    // Half, not zero: a faint edge that wrote depth would cut a fringe. A dot too small to show a fringe
    // keeps its whole soft edge instead, or a few-pixel dot loses half of itself and all but vanishes.
    if (alpha < select(0.5, 0.02, v.size < SMALL_DOT * dotScale)) {
        discard;
    }

    return vec4f(tinted(v.tint) * alpha, alpha);
}

@vertex
fn lineVertex(@builtin(vertex_index) id: u32) -> Shown {
    let side = 2 * dimension();
    let index = linePoint(i32(id), side);
    let here = drawn[index.x * side + index.y];
    let clip = clipOf(here.xyz, viewProjection(eyeOf(view(playhead()))));

    return Shown(clip, vec2f(0.0), here.w, 1.0, here.xyz, vec4f(0.0));
}

@vertex
fn surfaceVertex(@builtin(vertex_index) id: u32) -> Shown {
    let side = 2 * dimension();
    let index = surfacePoint(i32(id), side);
    let here = drawn[index.x * side + index.y];
    let clip = clipOf(here.xyz, viewProjection(eyeOf(view(playhead()))));

    return Shown(clip, vec2f(0.0), here.w, 1.0, here.xyz, vec4f(0.0));
}

@fragment
fn plainFragment(v: Shown) -> @location(0) vec4f {
    return vec4f(tinted(v.tint), 1.0);
}

// A flat normal from the surface's own slope; abs, because a lattice has no outside.
@fragment
fn surfaceFragment(v: Shown) -> @location(0) vec4f {
    let face = cross(dpdx(v.world), dpdy(v.world));
    var shade = 1.0;

    // A collapsed triangle has no normal, and normalize(0) is NaN.
    if (dot(face, face) >= 1e-20) {
        shade = 0.35 + 0.65 * abs(dot(normalize(face), LIGHT));
    }

    return vec4f(tinted(v.tint) * shade, 1.0);
}

@vertex
fn axisVertex(@builtin(vertex_index) id: u32) -> Shown {
    let axis = axisPoint(i32(id));
    let clip = clipOf(axis.position, viewProjection(eyeOf(view(playhead()))));

    return Shown(clip, vec2f(0.0), 0.0, 1.0, axis.position, axis.colour);
}

@fragment
fn axisFragment(v: Shown) -> @location(0) vec4f {
    return vec4f(v.colour.rgb * v.colour.a, v.colour.a);
}

// One triangle that covers the target, of the backdrop at the fade's strength: trails fade into the canvas colour.
@vertex
fn fadeVertex(@builtin(vertex_index) id: u32) -> Shown {
    let corner = vec2f(f32((id << 1u) & 2u), f32(id & 2u));

    return Shown(vec4f(corner * 2.0 - 1.0, 0.0, 1.0), vec2f(0.0), 0.0, 1.0, vec3f(0.0), vec4f(0.0));
}

@fragment
fn fadeFragment(v: Shown) -> @location(0) vec4f {
    let fade = frame.look.y;

    return vec4f(textureSampleLevel(palette, nearest, vec2f(0.0, 0.5), 0.0).rgb * fade, fade);
}
