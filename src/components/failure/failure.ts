export type Failure = {
    readonly title: string;
    readonly message: string;
    readonly advice: string;
};

export const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

export const stopped = (error: unknown): Failure => ({
    title: 'This window stopped',
    message: messageOf(error),
    advice: 'Everything else is still running. Close this window, or pick a program from its title to start it again.',
});
