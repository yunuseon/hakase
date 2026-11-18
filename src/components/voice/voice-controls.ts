import {
    ARTICULATIONS,
    DECAY,
    GLIDE,
    isArticulation,
    isScale,
    isShape,
    isVoiceInstrument,
    noteName,
    ROOTS,
    SCALES,
    SHAPES,
    VOICE_INSTRUMENTS,
    type Shape,
    type Voice,
    type VoiceCommand,
} from '../../model/voice.ts';
import {
    numberOf,
    section,
    textOf,
    type PropertyChange,
    type Section,
} from '../../shared/properties.ts';

const GLYPHS: Readonly<Record<Shape, string>> = {
    sine: 'M2 12 C6 3 10 3 12 12 S18 21 22 12',
    triangle: 'M2 12 L7 5 L17 19 L22 12',
    sawtooth: 'M2 17 L12 6 V17 L22 6 V17',
    square: 'M2 17 V7 H12 V17 H22 V7',
};

const named = (values: readonly string[]) => values.map(value => ({ value, label: value }));

const seconds = (value: number) => `${value.toFixed(2)} s`;

export const voiceSections = (voice: Voice): readonly Section[] => {
    const synth = voice.instrument === 'synth';

    return [
        section(
            'sound',
            null,
            [
                {
                    kind: 'choice',
                    id: 'instrument',
                    label: 'instrument',
                    value: voice.instrument,
                    options: named(VOICE_INSTRUMENTS),
                },
                {
                    kind: 'range',
                    id: 'volume',
                    label: 'volume',
                    value: voice.volume,
                    min: 0,
                    max: 1,
                    step: 0.01,
                    text: `${Math.round(voice.volume * 100)}%`,
                    hint: 'how loud; a volume signal swells it',
                },
            ],
            false,
        ),
        ...(synth
            ? [
                  section('synth', 'Synth', [
                      {
                          kind: 'choice',
                          id: 'shape',
                          label: 'shape',
                          value: voice.shape,
                          options: SHAPES.map(shape => ({
                              value: shape,
                              label: shape,
                              glyph: GLYPHS[shape],
                          })),
                      },
                      {
                          kind: 'choice',
                          id: 'articulation',
                          label: 'notes',
                          value: voice.articulation,
                          options: named(ARTICULATIONS),
                          hint: 'pluck: each new note strikes and fades; drone: one tone that follows the pitch',
                      },
                      ...(voice.articulation === 'pluck'
                          ? [
                                {
                                    kind: 'range' as const,
                                    id: 'decay',
                                    label: 'decay',
                                    value: voice.decay,
                                    min: DECAY.low,
                                    max: DECAY.high,
                                    step: 0.01,
                                    text: seconds(voice.decay),
                                    hint: 'how long a struck note takes to fade',
                                },
                            ]
                          : []),
                      {
                          kind: 'range',
                          id: 'glide',
                          label: 'glide',
                          value: voice.glide,
                          min: GLIDE.low,
                          max: GLIDE.high,
                          step: 0.01,
                          text: seconds(voice.glide),
                          hint: 'how long the pitch takes to slide to a new note',
                      },
                  ]),
              ]
            : []),
        section('pitch', 'Pitch', [
            {
                kind: 'choice',
                id: 'root',
                label: 'root',
                value: String(voice.root),
                options: Array.from({ length: ROOTS.high - ROOTS.low + 1 }, (_, index) => ({
                    value: String(ROOTS.low + index),
                    label: noteName(ROOTS.low + index),
                })),
            },
            {
                kind: 'choice',
                id: 'scale',
                label: 'scale',
                value: voice.scale,
                options: named(SCALES),
            },
        ]),
    ];
};

export const voiceCommandOf = (change: PropertyChange): VoiceCommand[] => {
    const text = textOf(change) ?? '';
    const value = numberOf(change);

    switch (change.id) {
        case 'instrument':
            return isVoiceInstrument(text) ? [{ kind: 'instrument', instrument: text }] : [];
        case 'shape':
            return isShape(text) ? [{ kind: 'shape', shape: text }] : [];
        case 'articulation':
            return isArticulation(text) ? [{ kind: 'articulation', articulation: text }] : [];
        case 'scale':
            return isScale(text) ? [{ kind: 'scale', scale: text }] : [];
        case 'root':
            return Number.isFinite(Number(text)) && text !== ''
                ? [{ kind: 'root', root: Number(text) }]
                : [];
        case 'decay':
            return value === null ? [] : [{ kind: 'decay', decay: value }];
        case 'glide':
            return value === null ? [] : [{ kind: 'glide', glide: value }];
        case 'volume':
            return value === null ? [] : [{ kind: 'volume', volume: value }];
        default:
            return [];
    }
};
