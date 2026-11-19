import { isBrushField, MAX_BRUSH, type PaintEvent, type PaintView } from '../../model/paint.ts';
import {
    numberOf,
    section,
    textOf,
    type PropertyChange,
    type Section,
} from '../../shared/properties.ts';
import { isSide, SIZES } from '../../shared/picture.ts';

export const paintSections = ({ size, hardness, flow, picture }: PaintView): readonly Section[] => [
    section('brush', 'Brush', [
        {
            kind: 'range',
            id: 'size',
            label: 'size',
            value: size,
            min: 1,
            max: MAX_BRUSH,
            step: 1,
            text: String(size),
            hint: '[ and ] size the brush',
        },
        {
            kind: 'range',
            id: 'hardness',
            label: 'edge',
            value: hardness,
            min: 0,
            max: 1,
            step: 0.05,
            text: hardness.toFixed(2),
            hint: 'how hard the edge of the brush is',
        },
        {
            kind: 'range',
            id: 'flow',
            label: 'flow',
            value: flow,
            min: 0.05,
            max: 1,
            step: 0.05,
            text: flow.toFixed(2),
            hint: 'how much ink each dab lays',
        },
    ]),
    section('canvas', 'Canvas', [
        {
            kind: 'choice',
            id: 'side',
            label: 'pixels',
            value: String(picture.side),
            options: SIZES.map(side => ({ value: String(side), label: `${side} × ${side}` })),
        },
    ]),
];

export const paintEventOfChange = (change: PropertyChange): PaintEvent[] => {
    const value = numberOf(change);
    const side = Number(textOf(change));

    return change.id === 'side'
        ? isSide(side)
            ? [{ kind: 'side', side }]
            : []
        : isBrushField(change.id) && value !== null
          ? [{ kind: 'brush', field: change.id, value }]
          : [];
};
