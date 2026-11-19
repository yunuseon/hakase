import {
    isPresetName,
    isRepeat,
    isStepCount,
    MAX_SWING,
    PRESET_NAMES,
    REPEATS,
    STEP_COUNTS,
    type Drums,
    type DrumsCommand,
} from '../../model/drums.ts';
import type { MenuGroup, MenuPick } from '../../shared/menu.ts';
import {
    numberOf,
    section,
    textOf,
    type PropertyChange,
    type Section,
} from '../../shared/properties.ts';
import { ICONS } from '../../shared/ui/icons.ts';

const percent = (value: number) => `${Math.round(value * 100)}%`;

export const drumsSections = (drums: Drums): readonly Section[] => [
    section(
        'pattern',
        null,
        [
            {
                kind: 'choice',
                id: 'steps',
                label: 'steps',
                value: String(drums.steps),
                options: STEP_COUNTS.map(steps => ({ value: String(steps), label: String(steps) })),
            },
            {
                kind: 'choice',
                id: 'repeat',
                label: 'plays',
                value: String(drums.repeat),
                options: REPEATS.map(repeat => ({ value: String(repeat), label: `×${repeat}` })),
                hint: 'how many times the pattern plays per loop',
            },
            {
                kind: 'range',
                id: 'swing',
                label: 'swing',
                value: drums.swing,
                min: 0,
                max: MAX_SWING,
                step: 0.01,
                text: percent(drums.swing / MAX_SWING),
                hint: 'holds back every second step, for a shuffle',
            },
            {
                kind: 'range',
                id: 'volume',
                label: 'volume',
                value: drums.volume,
                min: 0,
                max: 1,
                step: 0.01,
                text: percent(drums.volume),
                hint: 'how loud; a volume signal swells it',
            },
        ],
        false,
    ),
];

export const drumsCommandOf = (change: PropertyChange): DrumsCommand[] => {
    const count = Number(textOf(change));
    const value = numberOf(change);

    switch (change.id) {
        case 'steps':
            return isStepCount(count) ? [{ kind: 'steps', steps: count }] : [];
        case 'repeat':
            return isRepeat(count) ? [{ kind: 'repeat', repeat: count }] : [];
        case 'swing':
            return value === null ? [] : [{ kind: 'swing', swing: value }];
        case 'volume':
            return value === null ? [] : [{ kind: 'volume', volume: value }];
        default:
            return [];
    }
};

export const drumsMenu: readonly MenuGroup[] = [
    {
        id: 'presets',
        items: PRESET_NAMES.map(preset => ({
            id: `preset.${preset}`,
            label: `Load ${preset}`,
            glyph: ICONS.play,
        })),
    },
    {
        id: 'clear',
        items: [
            { id: 'clear', label: 'Clear the pattern', glyph: ICONS.remove, destructive: true },
        ],
    },
];

export const drumsMenuCommandOf = ({ id }: MenuPick): DrumsCommand[] => {
    const preset = id.startsWith('preset.') ? id.slice('preset.'.length) : '';

    return id === 'clear'
        ? [{ kind: 'clear' }]
        : isPresetName(preset)
          ? [{ kind: 'preset', preset }]
          : [];
};
