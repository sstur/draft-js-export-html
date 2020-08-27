// @flow

import MarkdownParser from './MarkdownParser';
import {stateFromElement} from 'draft-js-import-element';

import type {ContentState} from 'draft-js';
import type {ElementStyles, CustomBlockFn, CustomInlineFn} from 'draft-js-import-element';

type Options = {
  elementStyles?: ElementStyles;
  blockTypes?: {[key: string]: string};
  customBlockFn?: CustomBlockFn;
  customInlineFn?: CustomInlineFn;
  parserOptions?: {[key: string]: mixed}; // TODO: Be more explicit
  inlineElements?: string[];
};

let defaultOptions: Options = {};

export default function stateFromMarkdown(
  markdown: string,
  options?: Options,
): ContentState {
  let {parserOptions, ...otherOptions} = options || defaultOptions;
  let element = MarkdownParser.parse(markdown, {getAST: true, ...parserOptions});
  return stateFromElement(element, otherOptions);
}
