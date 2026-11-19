import {
    ASPECTS,
    EXPORT_SIZES,
    FRAME_RATES,
    isAspect,
    QUALITIES,
    type Aspect,
    type ExportChange,
    type ExportSettings,
} from '../../../model/sketch/export.ts';
import { section, textOf, type PropertyChange, type Section } from '../../../shared/properties.ts';

const named = (values: readonly (string | number)[], unit = '') =>
    values.map(value => ({ value: String(value), label: `${value}${unit}` }));

export const exportSections = (
    settings: ExportSettings,
    aspect: Aspect | null,
): readonly Section[] => [
    section(
        'export',
        null,
        [
            ...(aspect === null
                ? []
                : [
                      {
                          kind: 'choice' as const,
                          id: 'aspect',
                          label: 'aspect',
                          value: aspect,
                          options: named(ASPECTS),
                      },
                  ]),
            {
                kind: 'choice',
                id: 'format',
                label: 'format',
                value: settings.format,
                options: [
                    { value: 'webm', label: 'WebM video' },
                    { value: 'png', label: 'PNG frames (zip)' },
                ],
            },
            {
                kind: 'choice',
                id: 'fps',
                label: 'fps',
                value: String(settings.fps),
                options: named(FRAME_RATES),
            },
            {
                kind: 'choice',
                id: 'size',
                label: 'size',
                value: String(settings.size),
                options: named(EXPORT_SIZES, ' px'),
            },
            ...(settings.format === 'webm'
                ? [
                      {
                          kind: 'choice' as const,
                          id: 'quality',
                          label: 'quality',
                          value: settings.quality,
                          options: named(QUALITIES),
                      },
                  ]
                : []),
        ],
        false,
    ),
];

export const exportChangeOf = (change: PropertyChange): ExportChange[] => {
    const text = textOf(change);

    if (text === null) {
        return [];
    }

    switch (change.id) {
        case 'fps':
        case 'size':
            return [{ field: change.id, value: Number(text) }];
        case 'format':
        case 'quality':
            return [{ field: change.id, value: text }];
        default:
            return [];
    }
};

export const aspectOf = (change: PropertyChange): Aspect[] => {
    const text = textOf(change);

    return change.id === 'aspect' && text !== null && isAspect(text) ? [text] : [];
};
