import { EMPTY, merge, Observable } from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
import { fromElementEvent$ } from '../../lib/rx.ts';
import { choiceIndex } from './choices.ts';

const buttonsOf = (group: Element): readonly HTMLButtonElement[] =>
    [...group.querySelectorAll('button[role="radio"]')].filter(
        (button): button is HTMLButtonElement =>
            button instanceof HTMLButtonElement && button.closest('[role="radiogroup"]') === group,
    );
const enabled = (button: HTMLButtonElement): boolean =>
    !button.disabled &&
    button.getAttribute('aria-disabled') !== 'true' &&
    button.closest('[hidden]') === null;
const changed$ = (root: ShadowRoot): Observable<void> =>
    new Observable(subscriber => {
        const observer = new MutationObserver(() => {
            subscriber.next();
        });
        observer.observe(root, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['aria-checked', 'disabled', 'aria-disabled', 'hidden'],
        });
        subscriber.next();
        return () => {
            observer.disconnect();
        };
    });
export const connectChoices$ = (root: ShadowRoot): Observable<void> => {
    const host = root.host;
    if (!(host instanceof HTMLElement)) {
        return EMPTY;
    }
    return merge(
        changed$(root).pipe(
            map(() =>
                [...root.querySelectorAll('[role="radiogroup"]')].flatMap(group => {
                    const buttons = buttonsOf(group);
                    const chosen =
                        buttons.find(
                            button =>
                                enabled(button) && button.getAttribute('aria-checked') === 'true',
                        ) ?? buttons.find(enabled);
                    return buttons.map(button => ({
                        button,
                        tabIndex: button === chosen ? 0 : -1,
                    }));
                }),
            ),
            tap(rows => {
                for (const { button, tabIndex } of rows) {
                    button.tabIndex = tabIndex;
                }
            }),
        ),
        fromElementEvent$(host, 'keydown').pipe(
            mergeMap(event => {
                const target = event.composedPath()[0];
                if (
                    event.defaultPrevented ||
                    event.altKey ||
                    event.ctrlKey ||
                    event.metaKey ||
                    !(target instanceof HTMLButtonElement) ||
                    target.getRootNode() !== root ||
                    target.getAttribute('role') !== 'radio'
                ) {
                    return [];
                }
                const group = target.closest('[role="radiogroup"]');
                if (group === null) {
                    return [];
                }
                const buttons = buttonsOf(group);
                const index = choiceIndex(
                    buttons.map(enabled),
                    buttons.indexOf(target),
                    event.key,
                    getComputedStyle(group).direction === 'rtl',
                );
                const button = index === null ? undefined : buttons[index];
                return button === undefined ? [] : [{ event, button }];
            }),
            tap(({ event, button }) => {
                event.preventDefault();
                button.focus();
                button.click();
            }),
        ),
    ).pipe(map(() => undefined));
};
