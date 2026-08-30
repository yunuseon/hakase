export const readStored = (key: string): unknown => {
    try {
        const text = localStorage.getItem(key);
        if (text === null) {
            return null;
        }

        return JSON.parse(text);
    } catch {
        return null;
    }
};

export const writeStored = (key: string, value: unknown): void => {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        return;
    }
};
