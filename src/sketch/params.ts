export const sketchParams = {
    height: 640,
    width: 640,

    dimension: 32,
    gapModifier: 0.1,
    depthScalar: 1,
    baseSize: 5,

    color1: '#222831',
    color2: '#393e46',
    color3: '#00ADB5',
    color4: '#EEEEEE',
};

export const timelineParams = {
    /** Loop length in seconds. `0` freezes the playhead on the slider value. */
    duration: 0,
};

export type SketchParams = typeof sketchParams;
export type TimelineParams = typeof timelineParams;
