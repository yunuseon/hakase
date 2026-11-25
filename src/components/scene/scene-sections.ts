import {
    isMaterial,
    isObjectField,
    isSceneField,
    isSceneKnob,
    isShape,
    MATERIALS,
    MAX_OBJECTS,
    OBJECT_FIELDS,
    SCENE_FIELDS,
    SCENE_KNOBS,
    SHAPES,
    type ObjectField,
    type Scene,
    type SceneCommand,
    type SceneField,
    type SceneKnob,
    type SceneObject,
} from '../../model/scene.ts';
import { isThemeName, themes } from '../../model/sketch/themes/registry.ts';
import {
    section,
    type Property,
    type PropertyChange,
    type Section,
} from '../../shared/properties.ts';
import { ICONS } from '../../shared/ui/icons.ts';

export const SCENE_TABS = ['objects', 'code', 'render'] as const;
export type SceneTab = (typeof SCENE_TABS)[number];
export const isSceneTab = (value: string): value is SceneTab =>
    SCENE_TABS.some(tab => tab === value);

export type SceneView = {
    readonly scene: Scene;
    readonly driven: Readonly<Record<SceneKnob, string | null>>;
};

const decimals = (step: number) => (step >= 1 ? 0 : 2);

const range = (
    id: string,
    label: string,
    value: number,
    spec: { readonly min: number; readonly max: number; readonly step: number },
): Property => ({
    kind: 'range',
    id,
    label,
    value,
    min: spec.min,
    max: spec.max,
    step: spec.step,
    text: value.toFixed(decimals(spec.step)),
});

const fieldsOf = ({ material }: SceneObject): readonly ObjectField[] => [
    'x',
    'y',
    'z',
    'size',
    'turn',
    'tint',
    ...(material === 'gloss' || material === 'metal' || material === 'glass'
        ? (['rough'] as const)
        : []),
    ...(material === 'light' ? (['glow'] as const) : []),
];

const objectSection = (object: SceneObject): Section =>
    section(
        `object.${object.id}`,
        `${object.material} ${object.shape}`,
        [
            {
                kind: 'choice',
                id: `object.${object.id}.shape`,
                label: 'shape',
                value: object.shape,
                options: SHAPES.map(shape => ({ value: shape, label: shape })),
            },
            {
                kind: 'choice',
                id: `object.${object.id}.material`,
                label: 'material',
                value: object.material,
                options: MATERIALS.map(material => ({ value: material, label: material })),
            },
            ...fieldsOf(object).map(field =>
                range(`object.${object.id}.${field}`, field, object[field], OBJECT_FIELDS[field]),
            ),
        ],
        true,
        {
            id: `remove.${object.id}`,
            label: 'Remove this object',
            glyph: ICONS.remove,
            disabled: false,
        },
    );

export const objectSections = ({ scene }: SceneView): readonly Section[] => [
    section('add', null, [
        {
            kind: 'choice',
            id: 'add',
            label: 'add',
            value: '',
            options:
                scene.objects.length >= MAX_OBJECTS
                    ? []
                    : SHAPES.map(shape => ({ value: shape, label: shape })),
        },
    ]),
    ...scene.objects.map(objectSection),
];

const sceneRange = (scene: Scene, field: SceneField, label: string): Property =>
    range(`set.${field}`, label, scene[field], SCENE_FIELDS[field]);

export const renderSections = ({ scene, driven }: SceneView): readonly Section[] => [
    section('light', 'Light', [
        sceneRange(scene, 'sun', 'sun turn'),
        sceneRange(scene, 'height', 'sun height'),
        sceneRange(scene, 'light', 'sun'),
        sceneRange(scene, 'sky', 'sky'),
        {
            kind: 'choice',
            id: 'theme',
            label: 'theme',
            value: scene.theme,
            options: Object.keys(themes).map(name => ({ value: name, label: name })),
        },
    ]),
    section('render', 'Render', [
        sceneRange(scene, 'bounces', 'bounces'),
        sceneRange(scene, 'exposure', 'exposure'),
        {
            kind: 'number',
            id: 'set.preview',
            label: 'still',
            value: scene.preview,
            step: 1,
            unit: 'spp',
        },
        {
            kind: 'number',
            id: 'set.export',
            label: 'export',
            value: scene.export,
            step: 1,
            unit: 'spp',
        },
    ]),
    section(
        'knobs',
        'Knobs',
        SCENE_KNOBS.map((knob): Property => {
            const chain = driven[knob];
            const base = range(`knob.${knob}`, knob, scene.knobs[knob], {
                min: 0,
                max: 1,
                step: 0.01,
            });

            return chain === null || base.kind !== 'range'
                ? base
                : { ...base, driven: { why: knob, chain } };
        }),
    ),
    section('camera', 'Camera', [
        sceneRange(scene, 'fov', 'field of view'),
        { kind: 'action', id: 'reset-view', label: 'reset view', glyph: ICONS.reset },
    ]),
];

const parts = (id: string): readonly string[] => id.split('.');

export const sceneCommandOf = ({ id, value }: PropertyChange): SceneCommand[] => {
    const [head, second, third] = parts(id);

    if (head === 'add' && typeof value === 'string' && isShape(value)) {
        return [{ kind: 'add', shape: value }];
    }
    if (head === 'remove' && second !== undefined) {
        return [{ kind: 'remove', id: second }];
    }
    if (head === 'reset-view') {
        return [{ kind: 'orbit', action: { kind: 'reset' } }];
    }
    if (head === 'theme' && typeof value === 'string' && isThemeName(value)) {
        return [{ kind: 'theme', theme: value }];
    }
    if (
        head === 'set' &&
        second !== undefined &&
        isSceneField(second) &&
        typeof value === 'number'
    ) {
        return [{ kind: 'set', field: second, value }];
    }
    if (
        head === 'knob' &&
        second !== undefined &&
        isSceneKnob(second) &&
        typeof value === 'number'
    ) {
        return [{ kind: 'knob', knob: second, value }];
    }
    if (head === 'object' && second !== undefined && third !== undefined) {
        if (third === 'shape' && typeof value === 'string' && isShape(value)) {
            return [{ kind: 'shape', id: second, shape: value }];
        }
        if (third === 'material' && typeof value === 'string' && isMaterial(value)) {
            return [{ kind: 'material', id: second, material: value }];
        }
        if (isObjectField(third) && typeof value === 'number') {
            return [{ kind: 'object', id: second, field: third, value }];
        }
    }

    return [];
};
