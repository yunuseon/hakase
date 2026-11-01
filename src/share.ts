import { Observable } from 'rxjs';
import { parseShare, shareHash, type Shared } from './library.ts';

// Read once on load and again on every hashchange, then cleared, so a reload does not import it twice.
export const sharedFormulas$: Observable<Shared> = new Observable<Shared>(subscriber => {
    const read = (): void => {
        const shared = parseShare(location.hash);

        if (shared !== null) {
            history.replaceState(null, '', `${location.pathname}${location.search}`);
            subscriber.next(shared);
        }
    };

    read();
    window.addEventListener('hashchange', read);

    return () => {
        window.removeEventListener('hashchange', read);
    };
});

export const shareUrl = (shared: Shared): string =>
    `${location.origin}${location.pathname}${shareHash(shared)}`;
