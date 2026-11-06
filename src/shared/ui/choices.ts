export const choiceIndex = (
    enabled: readonly boolean[],
    current: number,
    key: string,
    rtl = false,
): number | null => {
    const choices = enabled.flatMap((on, index) => (on ? [index] : []));
    if (choices.length === 0) {
        return null;
    }
    if (key === 'Home') {
        return choices[0] ?? null;
    }
    if (key === 'End') {
        return choices.at(-1) ?? null;
    }
    const step =
        key === 'ArrowDown'
            ? 1
            : key === 'ArrowUp'
              ? -1
              : key === 'ArrowRight'
                ? rtl
                    ? -1
                    : 1
                : key === 'ArrowLeft'
                  ? rtl
                      ? 1
                      : -1
                  : 0;
    if (step === 0) {
        return null;
    }
    const at = choices.indexOf(current);
    return (
        choices[
            (at < 0 ? (step > 0 ? 0 : choices.length - 1) : at + step + choices.length) %
                choices.length
        ] ?? null
    );
};
