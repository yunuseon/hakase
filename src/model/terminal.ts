export type TerminalStyle = 'floating' | 'docked';

export type TerminalState = {
    readonly style: TerminalStyle;
    readonly open: boolean;
};

export type TerminalAction =
    { readonly kind: 'toggle' } | { readonly kind: 'close' } | { readonly kind: 'switch' };

const settled = (state: TerminalState): TerminalState =>
    state.style === 'floating' ? { ...state, open: true } : state;

export const initialTerminal: TerminalState = { style: 'floating', open: true };

export const reduceTerminal = (state: TerminalState, action: TerminalAction): TerminalState => {
    if (action.kind === 'switch') {
        // Docking with the panel shut would look like the terminal vanished.
        const style: TerminalStyle = state.style === 'floating' ? 'docked' : 'floating';
        return settled({ style, open: true });
    }

    return settled({ ...state, open: action.kind === 'close' ? false : !state.open });
};

export const dockLabel = ({ style }: TerminalState): string =>
    style === 'floating' ? 'dock' : 'undock';
