import { HksCircularSlider } from '../components/slider/circular/circular-slider.component.ts';
import type { Program } from '../program.ts';

export const dial = new HksCircularSlider();

export const playheadProgram: Program = {
    id: 'playhead',
    title: 'playhead',
    kind: 'floating',
    content: dial,
    connect$: ({ playhead$ }) => dial.connect$(playhead$),
};
