#version 300 es
precision highp float;

#define PI 3.141592653589793

uniform int uDimension;
uniform float uPlayhead;
uniform float uDepthScalar;
uniform float uBaseSize;
uniform float uPixelRatio;

out float vDepth;
out float vPointSize;

// Function prototype, not dead code: the formula is concatenated after this file.
vec3 formula(float x, float y, float t);

void main() {
    int n = 2 * uDimension;
    int i = gl_VertexID / n - uDimension;
    int j = gl_VertexID % n - uDimension;

    // Cell centres: plain i / d spans [-1, 1) and shifts the lattice half a step.
    float d = float(uDimension);
    vec3 v = formula((float(i) + 0.5) / d, (float(j) + 0.5) / d, uPlayhead);

    gl_Position = vec4(v.x, v.y, 0.0, 1.0);

    float size = v.z * uDepthScalar * uBaseSize * uPixelRatio;
    gl_PointSize = size;

    vPointSize = size;
    vDepth = v.z;
}
