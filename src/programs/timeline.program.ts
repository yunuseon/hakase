import { HksLinearSlider } from '../components/slider/linear/linear-slider.component.ts';
import type { Program } from '../program.ts';

export const timeline = new HksLinearSlider();

export const timelineProgram: Program = {
    id: 'timeline',
    title: 'timeline',
    kind: 'floating',
    content: timeline,
    connect$: ({ playhead$ }) => timeline.connect$(playhead$),
};
