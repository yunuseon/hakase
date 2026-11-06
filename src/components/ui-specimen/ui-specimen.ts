export type SpecimenView = {
    readonly kind: string;
    readonly label: string;
    readonly disabled: boolean;
    readonly value: number;
    readonly text: string;
    readonly choice: string;
    readonly checked: boolean;
    readonly colour: string;
    readonly listening: boolean;
};
export type SpecimenChange =
    | { readonly kind: 'text' | 'choice' | 'colour' | 'action'; readonly value: string }
    | { readonly kind: 'check'; readonly value: boolean }
    | { readonly kind: 'value'; readonly value: number }
    | { readonly kind: 'listen' };
export type SpecimenInput =
    | SpecimenChange
    | {
          readonly kind: 'args';
          readonly label: string;
          readonly disabled: boolean;
          readonly value: number;
      };
export const initialSpecimen: SpecimenView = {
    kind: 'buttons',
    label: 'Example',
    disabled: false,
    value: 35,
    text: '',
    choice: 'one',
    checked: false,
    colour: '#c8553d',
    listening: false,
};
export const reduceSpecimen = (view: SpecimenView, input: SpecimenInput): SpecimenView => {
    switch (input.kind) {
        case 'args':
            return { ...view, label: input.label, disabled: input.disabled, value: input.value };
        case 'text':
            return { ...view, text: input.value };
        case 'choice':
            return { ...view, choice: input.value };
        case 'colour':
            return { ...view, colour: input.value };
        case 'check':
            return { ...view, checked: input.value };
        case 'value':
            return { ...view, value: input.value };
        case 'listen':
            return { ...view, listening: !view.listening };
        case 'action':
            return view;
    }
};
