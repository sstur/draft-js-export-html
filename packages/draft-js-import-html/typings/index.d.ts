/// <reference types="draft-js" />

declare module 'draft-js-import-html' {
    import draftjs = require('draft-js');

    export type CustomBlockFn = (element: Element) => undefined | null | CustomBlockObject;
    export type CustomInlineFn = (element: Element, inlineCreators: InlineCreators) => undefined | null | Style | draftjs.EntityInstance;

    export type CustomBlockObject = {
        type?: string;
        data?: Object;
    };

    export type InlineCreators = {
        Style: (style: string) => Style;
        Entity: (type: string, data?: Object) => draftjs.EntityInstance;
    };

    export type Style = {
        type: 'STYLE';
        style: string;
    };

    export interface Options {
        parser?: (html: string) => HTMLBodyElement;
        elementStyles?: { [styleName: string]: string };
        customBlockFn?: CustomBlockFn;
        customInlineFn?: CustomInlineFn;
        inlineElements?: string []
    }

    export function stateFromHTML(html: string, options?: Options): draftjs.ContentState;
}
