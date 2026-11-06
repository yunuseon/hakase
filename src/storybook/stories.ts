import { EMPTY } from 'rxjs';
import { map } from 'rxjs/operators';
import { TOKENS } from '../appearance.ts';
import { HksDesignFoundations } from '../components/design-foundations/design-foundations.component.ts';
import { defaults, type Story } from './story.ts';
import { chromeStories } from './chrome-stories.ts';
import { detailStories } from './detail-stories.ts';
import { primitiveStories } from './primitive-stories.ts';
import { controlStories } from './control-stories.ts';
import { programStories, specimenPrograms } from './program-stories.ts';

const foundations: Story = {
    id: 'foundations',
    title: 'Design foundations',
    group: 'Foundations',
    description:
        'The existing colour tokens, typography, spacing and program icons, displayed in the selected appearance.',
    elements: ['hks-design-foundations'],
    variants: [
        { id: 'colours', title: 'Colour tokens' },
        { id: 'type', title: 'Typography' },
        { id: 'space', title: 'Space & shape' },
        { id: 'icons', title: 'Icons' },
    ],
    controls: ['label'],
    defaults: { ...defaults, label: 'Room to think.' },
    height: 430,
    code: '// Shared semantic tokens come from src/appearance.ts.\n// Appearance presets live in src/appearances.ts.\n// Components inherit --panel, --ink, --accent, … through shadow roots.',
    action: null,
    create: ({ args$, variant }) => {
        const element = new HksDesignFoundations();
        return {
            element,
            run$: element.connect$(
                args$.pipe(
                    map(args => ({
                        kind: variant,
                        label: args.label,
                        tokens: TOKENS,
                        icons: specimenPrograms.map(program => ({
                            name: program.title,
                            path: program.icon,
                        })),
                    })),
                ),
            ),
            events$: EMPTY,
        };
    },
};
export const stories: readonly Story[] = [
    foundations,
    ...primitiveStories,
    ...controlStories,
    ...programStories,
    ...detailStories,
    ...chromeStories,
];
