export const PORT_TYPES = [
    'clock',
    'level',
    'bit',
    'picture',
    'sheet',
    'sound',
    'schedule',
    'timer',
    'tasks',
    'reading',
    'zones',
    'notes',
    'habits',
    'bookmarks',
    'formula',
    'theme',
    'component',
] as const;

export type PortType = (typeof PORT_TYPES)[number];

export type Conversion = {
    readonly from: PortType;
    readonly to: PortType;
    readonly retires: boolean;
};

export const CONVERSIONS = [
    { from: 'bit', to: 'level', retires: false },
    { from: 'timer', to: 'reading', retires: false },
    { from: 'schedule', to: 'reading', retires: false },
    { from: 'tasks', to: 'reading', retires: false },
] as const satisfies readonly Conversion[];

export const converts = (from: PortType, to: PortType): boolean =>
    from === to || CONVERSIONS.some(conversion => conversion.from === from && conversion.to === to);
