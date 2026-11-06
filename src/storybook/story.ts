import type { Observable } from 'rxjs';
import type { StoryArgs, StoryEvent, StoryInfo } from '../components/storybook/storybook.ts';

export type DemoContext = {
    readonly args$: Observable<StoryArgs>;
    readonly variant: string;
    readonly actions$: Observable<void>;
};
export type Demo = {
    readonly element: HTMLElement;
    readonly run$: Observable<unknown>;
    readonly events$: Observable<StoryEvent>;
};
export type Story = StoryInfo & { readonly create: (context: DemoContext) => Demo };
export const defaults: StoryArgs = { label: 'Example', value: 35, disabled: false };
export const recorded = (name: string, value: unknown): StoryEvent => ({
    name,
    detail: JSON.stringify(value) ?? '',
});
