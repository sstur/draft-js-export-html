// @flow

import replaceTextWithMeta from './lib/replaceTextWithMeta';
import {CharacterMetadata, ContentBlock, ContentState, genKey} from 'draft-js';
import {List, Map, OrderedSet, Repeat, Seq} from 'immutable';
import {BLOCK_TYPE, ENTITY_TYPE, INLINE_STYLE} from 'draft-js-utils';
import {NODE_TYPE_ELEMENT, NODE_TYPE_TEXT} from 'synthetic-dom';
import {
  INLINE_ELEMENTS,
  SPECIAL_ELEMENTS,
  SELF_CLOSING_ELEMENTS,
} from './lib/Constants';

import type {Entity} from 'draft-js';
import type {Set, IndexedSeq} from 'immutable';
import type {
  Node as SyntheticNode,
  ElementNode as SyntheticElement,
} from 'synthetic-dom';

type DOMNode = SyntheticNode | Node;
type DOMElement = SyntheticElement | Element;

type CharacterMetaSeq = IndexedSeq<CharacterMetadata>;
type Style = string;
type StyleSet = Set<Style>;

type TextFragment = {
  text: string;
  characterMeta: CharacterMetaSeq;
};

type BlockData = {[key: string]: mixed};

// A ParsedBlock has two purposes:
//   1) to keep data about the block (textFragments, type)
//   2) to act as some context for storing parser state as we parse its contents
type ParsedBlock = {
  tagName: string;
  textFragments: Array<TextFragment>;
  type: string;
  // A stack in which the last item represents the styles that will apply
  // to any text node descendants.
  styleStack: Array<StyleSet>;
  entityStack: Array<?Entity>;
  depth: number;
  data: ?BlockData;
};

export type ElementStyles = {[tagName: string]: Style};

type PartialBlock = {
  type?: string;
  data?: BlockData;
};

export type CustomBlockFn = (
  element: DOMElement,
) => ?PartialBlock;

type EntityMutability = 'IMMUTABLE' | 'MUTABLE' | 'SEGMENTED';

type CustomStyle = {
  type: 'STYLE';
  style: Style;
};

type CustomEntity = {
  type: 'ENTITY';
  entityKey: string;
};

export type CustomInlineFn = (
  element: DOMElement,
  creators: {
    Style: (style: string) => CustomStyle;
    Entity: (type: string, data: DataMap<mixed>, mutability?: EntityMutability) => CustomEntity;
  }
) => ?(CustomStyle | CustomEntity);

type Options = {
  elementStyles?: ElementStyles;
  blockTypes?: {[key: string]: string};
  customBlockFn?: CustomBlockFn;
  customInlineFn?: CustomInlineFn;
};
type DataMap<T> = {[key: string]: T};

const DATA_URL = /^data:/i;
const NO_STYLE = OrderedSet();
const NO_ENTITY = null;

const EMPTY_BLOCK = new ContentBlock({
  key: genKey(),
  text: '',
  type: BLOCK_TYPE.UNSTYLED,
  characterList: List(),
  depth: 0,
});

const LINE_BREAKS = /(\r\n|\r|\n)/g;
// We use `\r` because that character is always stripped from source (normalized
// to `\n`), so it's safe to assume it will only appear in the text content when
// we put it there as a placeholder.
const SOFT_BREAK_PLACEHOLDER = '\r';
const ZERO_WIDTH_SPACE = '\u200B';
const DATA_ATTRIBUTE = /^data-([a-z0-9-]+)$/;

// Map element attributes to entity data.
const ELEM_ATTR_MAP = {
  a: {href: 'url', rel: 'rel', target: 'target', title: 'title'},
  img: {src: 'src', alt: 'alt', width: 'width', height: 'height'},
};

const getEntityData = (tagName: string, element: DOMElement) => {
  const data: DataMap<string> = {};
  if (ELEM_ATTR_MAP.hasOwnProperty(tagName)) {
    const attrMap = ELEM_ATTR_MAP[tagName];
    for (let i = 0; i < element.attributes.length; i++) {
      const {name, value} = element.attributes[i];
      if (typeof value === 'string') {
        let strVal = value;
        if (attrMap.hasOwnProperty(name)) {
          const newName = attrMap[name];
          data[newName] = strVal;
        } else if (DATA_ATTRIBUTE.test(name)) {
          data[name] = strVal;
        }
      }
    }
  }
  return data;
};

// Functions to create entities from elements.
const ElementToEntity = {
  a(
    generator: ContentGenerator,
    tagName: string,
    element: DOMElement,
  ): ?string {
    let data = getEntityData(tagName, element);
    // Don't add `<a>` elements with invalid href.
    if (isAllowedHref(data.url)) {
      return generator.createEntity(ENTITY_TYPE.LINK, data);
    }
  },
  img(
    generator: ContentGenerator,
    tagName: string,
    element: DOMElement,
  ): ?string {
    let data = getEntityData(tagName, element);
    // Don't add `<img>` elements with no src.
    if (data.src != null) {
      return generator.createEntity(ENTITY_TYPE.IMAGE, data);
    }
  },
};

class ContentGenerator {
  contentStateForEntities: ContentState;
  blockStack: Array<ParsedBlock>;
  blockList: Array<ParsedBlock>;
  depth: number;
  options: Options;
  // This will be passed to the customInlineFn to allow it
  // to return a Style() or Entity().
  inlineCreators = {
    Style: (style: Style) => ({type: 'STYLE', style}),
    Entity: (type: string, data: DataMap<mixed>, mutability: EntityMutability = 'MUTABLE') => ({
      type: 'ENTITY',
      entityKey: this.createEntity(type, toStringMap(data), mutability),
    }),
  };

  constructor(options: Options = {}) {
    this.options = options;
    this.contentStateForEntities = ContentState.createFromBlockArray([]);
    // This represents the hierarchy as we traverse nested elements; for
    // example [body, ul, li] where we must know li's parent type (ul or ol).
    this.blockStack = [];
    // This is a linear list of blocks that will form the output; for example
    // [p, li, li, blockquote].
    this.blockList = [];
    this.depth = 0;
  }

  process(element: DOMElement): ContentState {
    this.processBlockElement(element);
    let contentBlocks = [];
    this.blockList.forEach((block) => {
      let {text, characterMeta} = concatFragments(block.textFragments);
      let includeEmptyBlock = false;
      // If the block contains only a soft break then don't discard the block,
      // but discard the soft break.
      if (text === SOFT_BREAK_PLACEHOLDER) {
        includeEmptyBlock = true;
        text = '';
      }
      if (block.tagName === 'pre') {
        ({text, characterMeta} = trimLeadingNewline(text, characterMeta));
      } else {
        ({text, characterMeta} = collapseWhiteSpace(text, characterMeta));
      }
      // Previously we were using a placeholder for soft breaks. Now that we
      // have collapsed whitespace we can change it back to normal line breaks.
      text = text.split(SOFT_BREAK_PLACEHOLDER).join('\n');
      // Discard empty blocks (unless otherwise specified).
      if (text.length || includeEmptyBlock) {
        contentBlocks.push(
          new ContentBlock({
            key: genKey(),
            text: text,
            type: block.type,
            characterList: characterMeta.toList(),
            depth: block.depth,
            data: block.data ? Map(block.data) : Map(),
          }),
        );
      }
    });
    if (!contentBlocks.length) {
      contentBlocks = [EMPTY_BLOCK];
    }
    return ContentState.createFromBlockArray(
      contentBlocks,
      this.contentStateForEntities.getEntityMap(),
    );
  }

  getBlockTypeFromTagName(tagName: string): string {
    let {blockTypes} = this.options;
    if (blockTypes && blockTypes[tagName]) {
      return blockTypes[tagName];
    }
    switch (tagName) {
      case 'li': {
        let parent = this.blockStack.slice(-1)[0];
        return parent.tagName === 'ol'
          ? BLOCK_TYPE.ORDERED_LIST_ITEM
          : BLOCK_TYPE.UNORDERED_LIST_ITEM;
      }
      case 'blockquote': {
        return BLOCK_TYPE.BLOCKQUOTE;
      }
      case 'h1': {
        return BLOCK_TYPE.HEADER_ONE;
      }
      case 'h2': {
        return BLOCK_TYPE.HEADER_TWO;
      }
      case 'h3': {
        return BLOCK_TYPE.HEADER_THREE;
      }
      case 'h4': {
        return BLOCK_TYPE.HEADER_FOUR;
      }
      case 'h5': {
        return BLOCK_TYPE.HEADER_FIVE;
      }
      case 'h6': {
        return BLOCK_TYPE.HEADER_SIX;
      }
      case 'pre': {
        return BLOCK_TYPE.CODE;
      }
      case 'figure': {
        return BLOCK_TYPE.ATOMIC;
      }
      default: {
        return BLOCK_TYPE.UNSTYLED;
      }
    }
  }

  processBlockElement(element: DOMElement) {
    if (!element) {
      return;
    }
    let {customBlockFn} = this.options;
    let tagName = element.nodeName.toLowerCase();
    let type: ?string;
    let data: ?BlockData;
    if (customBlockFn) {
      let customBlock = customBlockFn(element);
      if (customBlock != null) {
        type = customBlock.type;
        data = customBlock.data;
      }
    }
    let isCustomType = true;
    if (type == null) {
      isCustomType = false;
      type = this.getBlockTypeFromTagName(tagName);
    }
    if (type === BLOCK_TYPE.CODE) {
      let language = element.getAttribute('data-language');
      if (language) {
        data = {...data, language};
      }
    }
    let hasDepth = canHaveDepth(type);
    let allowRender = !SPECIAL_ELEMENTS.hasOwnProperty(tagName);
    if (!isCustomType && !hasSemanticMeaning(type)) {
      let parent = this.blockStack.slice(-1)[0];
      if (parent) {
        type = parent.type;
      }
    }
    let block: ParsedBlock = {
      tagName: tagName,
      textFragments: [],
      type: type,
      styleStack: [NO_STYLE],
      entityStack: [NO_ENTITY],
      depth: hasDepth ? this.depth : 0,
      data,
    };
    if (allowRender) {
      this.blockList.push(block);
      if (hasDepth) {
        this.depth += 1;
      }
    }
    this.blockStack.push(block);
    if (element.childNodes != null) {
      Array.from(element.childNodes).forEach(this.processNode, this);
    }
    this.blockStack.pop();
    if (allowRender && hasDepth) {
      this.depth -= 1;
    }
  }

  processInlineElement(element: DOMElement) {
    let tagName = element.nodeName.toLowerCase();
    if (tagName === 'br') {
      this.processText(SOFT_BREAK_PLACEHOLDER);
      return;
    }
    let block = this.blockStack.slice(-1)[0];
    let style = block.styleStack.slice(-1)[0];
    let entityKey = block.entityStack.slice(-1)[0];
    let {customInlineFn} = this.options;
    let customInline = customInlineFn ? customInlineFn(element, this.inlineCreators) : null;
    if (customInline != null) {
      switch (customInline.type) {
        case 'STYLE': {
          style = style.union(customInline.style.split(' '));
          break;
        }
        case 'ENTITY': {
          entityKey = customInline.entityKey;
          break;
        }
      }
    } else {
      style = addStyleFromTagName(style, tagName, this.options.elementStyles);
      if (ElementToEntity.hasOwnProperty(tagName)) {
        // If the to-entity function returns nothing, use the existing entity.
        entityKey = ElementToEntity[tagName](this, tagName, element) || entityKey;
      }
    }
    block.styleStack.push(style);
    block.entityStack.push(entityKey);
    if (element.childNodes != null) {
      Array.from(element.childNodes).forEach(this.processNode, this);
    }
    if (SELF_CLOSING_ELEMENTS.hasOwnProperty(tagName)) {
      this.processText('\u00A0');
    }
    block.entityStack.pop();
    block.styleStack.pop();
  }

  processTextNode(node: DOMNode) {
    let text = node.nodeValue;
    // This is important because we will use \r as a placeholder for a soft break.
    text = text.replace(LINE_BREAKS, '\n');
    // Replace zero-width space (we use it as a placeholder in markdown) with a
    // soft break.
    // TODO: The import-markdown package should correctly turn breaks into <br>
    // elements so we don't need to include this hack.
    text = text.split(ZERO_WIDTH_SPACE).join(SOFT_BREAK_PLACEHOLDER);
    this.processText(text);
  }

  processText(text: string) {
    let block = this.blockStack.slice(-1)[0];
    let style = block.styleStack.slice(-1)[0];
    let entity = block.entityStack.slice(-1)[0];
    let charMetadata = CharacterMetadata.create({
      entity: entity,
    });
    style.forEach((s) => {
      charMetadata = CharacterMetadata.applyStyle(charMetadata, s);
      return true;
    });
    let seq: CharacterMetaSeq = Repeat(charMetadata, text.length);
    block.textFragments.push({
      text: text,
      characterMeta: seq,
    });
  }

  processNode(node: DOMNode) {
    if (node.nodeType === NODE_TYPE_ELEMENT) {
      // $FlowIssue
      let element: DOMElement = node;
      let tagName = element.nodeName.toLowerCase();
      if (INLINE_ELEMENTS.hasOwnProperty(tagName)) {
        this.processInlineElement(element);
      } else {
        this.processBlockElement(element);
      }
    } else if (node.nodeType === NODE_TYPE_TEXT) {
      this.processTextNode(node);
    }
  }

  createEntity(type: string, data: DataMap<string>, mutability: EntityMutability = 'MUTABLE') {
    this.contentStateForEntities = this.contentStateForEntities.createEntity(
      type,
      mutability,
      data,
    );
    return this.contentStateForEntities.getLastCreatedEntityKey();
  }
}

function trimLeadingNewline(
  text: string,
  characterMeta: CharacterMetaSeq,
): TextFragment {
  if (text.charAt(0) === '\n') {
    text = text.slice(1);
    characterMeta = characterMeta.slice(1);
  }
  return {text, characterMeta};
}

function trimLeadingSpace(
  text: string,
  characterMeta: CharacterMetaSeq,
): TextFragment {
  while (text.charAt(0) === ' ') {
    text = text.slice(1);
    characterMeta = characterMeta.slice(1);
  }
  return {text, characterMeta};
}

function trimTrailingSpace(
  text: string,
  characterMeta: CharacterMetaSeq,
): TextFragment {
  while (text.slice(-1) === ' ') {
    text = text.slice(0, -1);
    characterMeta = characterMeta.slice(0, -1);
  }
  return {text, characterMeta};
}

function collapseWhiteSpace(
  text: string,
  characterMeta: CharacterMetaSeq,
): TextFragment {
  text = text.replace(/[ \t\n]/g, ' ');
  ({text, characterMeta} = trimLeadingSpace(text, characterMeta));
  ({text, characterMeta} = trimTrailingSpace(text, characterMeta));
  let i = text.length;
  while (i--) {
    if (text.charAt(i) === ' ' && text.charAt(i - 1) === ' ') {
      text = text.slice(0, i) + text.slice(i + 1);
      characterMeta = characterMeta
        .slice(0, i)
        .concat(characterMeta.slice(i + 1));
    }
  }
  // There could still be one space on either side of a softbreak.
  ({text, characterMeta} = replaceTextWithMeta(
    {text, characterMeta},
    SOFT_BREAK_PLACEHOLDER + ' ',
    SOFT_BREAK_PLACEHOLDER,
  ));
  ({text, characterMeta} = replaceTextWithMeta(
    {text, characterMeta},
    ' ' + SOFT_BREAK_PLACEHOLDER,
    SOFT_BREAK_PLACEHOLDER,
  ));
  return {text, characterMeta};
}

function canHaveDepth(blockType: string): boolean {
  switch (blockType) {
    case BLOCK_TYPE.UNORDERED_LIST_ITEM:
    case BLOCK_TYPE.ORDERED_LIST_ITEM: {
      return true;
    }
    default: {
      return false;
    }
  }
}

function concatFragments(fragments: Array<TextFragment>): TextFragment {
  let text = '';
  let characterMeta: CharacterMetaSeq = Seq();
  fragments.forEach((textFragment: TextFragment) => {
    text = text + textFragment.text;
    characterMeta = characterMeta.concat(textFragment.characterMeta);
  });
  return {text, characterMeta};
}

function addStyleFromTagName(
  styleSet: StyleSet,
  tagName: string,
  elementStyles?: ElementStyles,
): StyleSet {
  switch (tagName) {
    case 'b':
    case 'strong': {
      return styleSet.add(INLINE_STYLE.BOLD);
    }
    case 'i':
    case 'em': {
      return styleSet.add(INLINE_STYLE.ITALIC);
    }
    case 'u':
    case 'ins': {
      return styleSet.add(INLINE_STYLE.UNDERLINE);
    }
    case 'code': {
      return styleSet.add(INLINE_STYLE.CODE);
    }
    case 's':
    case 'del': {
      return styleSet.add(INLINE_STYLE.STRIKETHROUGH);
    }
    default: {
      // Allow custom styles to be provided.
      if (elementStyles && elementStyles[tagName]) {
        return styleSet.add(elementStyles[tagName]);
      }

      return styleSet;
    }
  }
}

function hasSemanticMeaning(blockType: string) {
  return blockType !== BLOCK_TYPE.UNSTYLED;
}

function toStringMap(input: mixed) {
  let result: DataMap<string> = {};
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    let obj = input;
    for (let key of Object.keys(obj)) {
      let value = obj[key];
      if (typeof value === 'string') {
        result[key] = value;
      }
    }
  }
  return result;
}

function isAllowedHref(input: ?string) {
  if (input == null || input.match(DATA_URL)) {
    return false;
  } else {
    return true;
  }
}

export function stateFromElement(
  element: DOMElement,
  options?: Options,
): ContentState {
  return new ContentGenerator(options).process(element);
}

export default stateFromElement;
