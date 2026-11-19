export type Option = { readonly value: string; readonly label: string; readonly glyph?: string };

type Named = { readonly id: string; readonly label: string; readonly hint?: string };

export type Driven = { readonly why: string; readonly chain: string; readonly text?: string };

export type Aside = {
    readonly id: string;
    readonly label: string;
    readonly value: string;
    readonly options: readonly Option[];
    readonly hint?: string;
};

export type SectionAction = {
    readonly id: string;
    readonly label: string;
    readonly glyph: string;
    readonly disabled: boolean;
};

export type End = { readonly id: string; readonly label: string; readonly value: number };

export type Property =
    | (Named & {
          readonly kind: 'choice';
          readonly value: string;
          readonly options: readonly Option[];
      })
    | (Named & {
          readonly kind: 'range';
          readonly value: number;
          readonly min: number;
          readonly max: number;
          readonly step: number;
          readonly text: string;
          readonly driven?: Driven;
          readonly aside?: Aside;
      })
    | (Named & {
          readonly kind: 'number';
          readonly value: number;
          readonly step: number;
          readonly unit?: string;
      })
    | (Named & {
          readonly kind: 'span';
          readonly low: End;
          readonly high: End;
          readonly step: number;
      })
    | (Named & { readonly kind: 'toggle'; readonly value: boolean })
    | (Named & { readonly kind: 'colour'; readonly value: string })
    | (Named & { readonly kind: 'text'; readonly value: string; readonly placeholder: string })
    | (Named & {
          readonly kind: 'action';
          readonly glyph?: string;
          readonly disabled?: boolean;
      });

export type PropertyKind = Property['kind'];

export type Section = {
    readonly id: string;
    readonly title: string | null;
    readonly fold: boolean;
    readonly properties: readonly Property[];
    readonly action?: SectionAction;
};

export type PropertyChange = { readonly id: string; readonly value: string | number | boolean };

export const section = (
    id: string,
    title: string | null,
    properties: readonly Property[],
    fold = title !== null,
    action?: SectionAction,
): Section =>
    action === undefined
        ? { id, title, fold, properties }
        : { id, title, fold, properties, action };

export const numberOf = ({ value }: PropertyChange): number | null =>
    typeof value === 'number' ? value : typeof value === 'boolean' ? Number(value) : null;

export const textOf = ({ value }: PropertyChange): string | null =>
    typeof value === 'string' ? value : null;

export const fieldOf = (id: string, group: string): string | null =>
    id.startsWith(`${group}.`) ? id.slice(group.length + 1) : null;

const MIN_CHARS = 3;

export const charsFor = (value: number, step: number): number => {
    const decimals = (String(step).split('.')[1] ?? '').length;

    return Math.max(MIN_CHARS, value.toFixed(decimals).length, String(value).length);
};

export const toggled = (open: ReadonlySet<string>, id: string): ReadonlySet<string> =>
    open.has(id) ? new Set([...open].filter(each => each !== id)) : new Set([...open, id]);
