/// <reference types="draft-js" />

declare module 'draft-js-export-html' {
    import draftjs = require("draft-js");

    type BlockStyleFn = (block: draftjs.ContentBlock) => RenderConfig|undefined;
    type EntityStyleFn = (entity: draftjs.EntityInstance) => RenderConfig|undefined;
    type BlockRenderer = (block: draftjs.ContentBlock) => string|undefined;
    type RenderConfig = {
        element?: string;
        attributes?: any;
        style?: any;
    };

    export interface Options {
        defaultBlockTag?: string | null;
        inlineStyles?: { [styleName: string]: RenderConfig };
        blockRenderers?: { [blockType: string]: BlockRenderer };
        blockStyleFn?: BlockStyleFn;
        entityStyleFn?: EntityStyleFn;
    }

    export function stateToHTML(content: draftjs.ContentState, options?: Options): string;
}
