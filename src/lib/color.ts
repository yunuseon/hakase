export type Rgb = {
    r: number;
    g: number;
    b: number;
};

export const parseHexColor = (hex: string): Rgb => {
    const value = Number.parseInt(hex.replace('#', ''), 16);

    return {
        r: ((value >> 16) & 255) / 255,
        g: ((value >> 8) & 255) / 255,
        b: (value & 255) / 255,
    };
};
