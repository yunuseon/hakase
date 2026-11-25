import {
    isSceneExample,
    SCENE_EXAMPLE_NAMES,
    SCENE_EXAMPLES,
    type SceneContent,
} from '../../model/scene-examples.ts';
import type { MenuGroup } from '../../shared/menu.ts';

const EXAMPLE = 'example.';

export const sceneMenu = (glyph: string): readonly MenuGroup[] => [
    {
        id: 'examples',
        items: SCENE_EXAMPLE_NAMES.map(name => ({
            id: `${EXAMPLE}${name}`,
            label: `Start from ${SCENE_EXAMPLES[name].label}`,
            glyph,
        })),
    },
];

export const exampleOf = (id: string): SceneContent | null => {
    const name = id.startsWith(EXAMPLE) ? id.slice(EXAMPLE.length) : '';

    return isSceneExample(name) ? SCENE_EXAMPLES[name].scene : null;
};
