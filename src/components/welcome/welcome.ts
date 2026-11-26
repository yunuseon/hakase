import type { FootprintView } from '../../shared/ui/icon.component.ts';

export type WelcomeCard = FootprintView & {
    readonly id: string;
    readonly name: string;
    readonly summary: string;
};

export type WelcomeView = {
    readonly shown: boolean;
    readonly cards: readonly WelcomeCard[];
};

export const hidden: WelcomeView = { shown: false, cards: [] };
