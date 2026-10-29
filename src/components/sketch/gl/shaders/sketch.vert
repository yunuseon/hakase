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

out float vDepth;
out float vPointSize;
out vec3 vPosition;

// Function prototype, not dead code: the formula is concatenated after this file.
vec3 formula(float x, float y, float t);

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
        int point = id / 4;
        return min(ivec2(point / side, point % side) + LINE_CORNERS[id % 4], side - 1);
    }

    int cell = id / 6;
    int cells = side - 1;

    return ivec2(cell / cells, cell % cells) + QUAD_CORNERS[id % 6];
}

void main() {
    int side = 2 * uDimension;
    ivec2 cell = latticePoint(gl_VertexID, side) - uDimension;

    // Cell centres: plain i / d spans [-1, 1) and shifts the lattice half a step.
    float d = float(uDimension);
    vec3 v = formula((float(cell.x) + 0.5) / d, (float(cell.y) + 0.5) / d, uPlayhead);

    // Only read with the depth test on: nearer, which is larger v.z, must be smaller z.
    gl_Position = vec4(v.x, v.y, 0.5 - 0.5 * clamp(v.z, 0.0, 1.0), 1.0);

    float size = v.z * uDepthScalar * uBaseSize * uPixelRatio;
    gl_PointSize = size;

    vPointSize = size;
    vDepth = v.z;
    vPosition = v;
}
