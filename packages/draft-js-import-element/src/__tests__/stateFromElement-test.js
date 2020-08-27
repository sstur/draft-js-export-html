// @flow
const {describe, it, expect} = global;
import stateFromElement from '../stateFromElement';
import {TextNode, ElementNode} from 'synthetic-dom';
import {convertToRaw} from 'draft-js';
import fs from 'fs';
import {join} from 'path';

// This separates the test cases in `data/test-cases.txt`.
const SEP = '\n\n#';

let testCasesRaw = fs.readFileSync(
  join(__dirname, '..', '..', 'test', 'test-cases.txt'),
  'utf8',
);

let testCases = testCasesRaw
  .slice(1)
  .trim()
  .split(SEP)
  .map((text) => {
    let lines = text.split('\n');
    let description = lines.shift().trim();
    let state = removeBlockKeys(JSON.parse(lines[0]));
    let html = lines.slice(1).join('\n');
    return {description, state, html};
  });

describe('stateFromElement', () => {
  it('should create content state', () => {
    let textNode = new TextNode('Hello World');
    let element = new ElementNode('div', [], [textNode]);
    let contentState = stateFromElement(element);
    let rawContentState = removeBlockKeys(convertToRaw(contentState));
    expect(rawContentState).toEqual({
      entityMap: {},
      blocks: [
        {
          text: 'Hello World',
          type: 'unstyled',
          data: {},
          depth: 0,
          inlineStyleRanges: [],
          entityRanges: [],
        },
      ],
    });
  });

  it('should support option customBlockFn (type)', () => {
    let textNode = new TextNode('Hello World');
    let element = new ElementNode('center', [], [textNode]);
    let options = {
      customBlockFn(element) {
        let {tagName} = element;
        if (tagName === 'CENTER') {
          return {type: 'center-align'};
        }
      },
    };
    let contentState = stateFromElement(element, options);
    let rawContentState = removeBlockKeys(convertToRaw(contentState));
    expect(rawContentState).toEqual({
      entityMap: {},
      blocks: [
        {
          text: 'Hello World',
          type: 'center-align',
          data: {},
          depth: 0,
          inlineStyleRanges: [],
          entityRanges: [],
        },
      ],
    });
  });

  it('should support option customBlockFn (data)', () => {
    let textNode = new TextNode('Hello World');
    let element = new ElementNode(
      'p',
      [{name: 'align', value: 'right'}],
      [textNode],
    );
    let options = {
      customBlockFn(element) {
        let {tagName} = element;
        if (
          tagName === 'P' &&
          element.getAttribute('align') === 'right'
        ) {
          return {data: {textAlign: 'right'}};
        }
      },
    };
    let contentState = stateFromElement(element, options);
    let rawContentState = removeBlockKeys(convertToRaw(contentState));
    expect(rawContentState).toEqual({
      entityMap: {},
      blocks: [
        {
          text: 'Hello World',
          type: 'unstyled',
          data: {textAlign: 'right'},
          depth: 0,
          inlineStyleRanges: [],
          entityRanges: [],
        },
      ],
    });
  });

  it('should support option customInlineFn', () => {
    let element = new ElementNode('div', [], [
      new ElementNode('span', [{name: 'class', value: 'bold'}], [
        new TextNode('Hello'),
      ]),
      new ElementNode('span', [{name: 'class', value: 'link'}], [
        new TextNode('World'),
      ]),
    ]);
    let options = {
      customInlineFn(el, {Style, Entity}) {
        if (el.tagName === 'SPAN' && el.className === 'bold') {
          return Style('BOLD');
        }
        if (el.tagName === 'SPAN' && el.className === 'link') {
          return Entity('LINK', {url: '/abc'});
        }
      },
    };
    let contentState = stateFromElement(element, options);
    let rawContentState = removeBlockKeys(convertToRaw(contentState));
    expect(rawContentState).toEqual({
      entityMap: {[0]: {type: 'LINK', mutability: 'MUTABLE', data: {url: '/abc'}}},
      blocks: [
        {
          text: 'HelloWorld',
          type: 'unstyled',
          depth: 0,
          inlineStyleRanges: [{offset: 0, length: 5, style: 'BOLD'}],
          entityRanges: [{offset: 5, length: 5, key: 0}],
          data: {},
        },
      ],
    });
  });

  it('should return multiple style from customInlineFn', () => {
    let element = new ElementNode('div', [], [
      new ElementNode(
        'span',
        [{style: 'font-family', value: 'sans-serif'},{style: 'font-size', value: '12px'},],
        [new TextNode('Hello')]
      )
    ]);
    let options = {
      customInlineFn(el, {Style}) {
        if (el.tagName === 'SPAN') {
          return Style(['CUSTOM_STYLE_1', 'CUSTOM_STYLE_2']);
        }
      },
    };
    let contentState = stateFromElement(element, options);
    let rawContentState = removeBlockKeys(convertToRaw(contentState));
    expect(rawContentState).toEqual({
      entityMap: {},
      blocks: [
        {
          text: 'Hello',
          type: 'unstyled',
          depth: 0,
          inlineStyleRanges: [
            {offset: 0, length: 5, style: 'CUSTOM_STYLE_1'},
            {offset: 0, length: 5, style: 'CUSTOM_STYLE_2'}
          ],
          entityRanges: [],
          data: {},
        },
      ],
    });
  });

  it('should support option elementStyles', () => {
    let textNode = new TextNode('Superscript');
    let element = new ElementNode('sup', [], [textNode]);
    let wrapperElement = new ElementNode('div', [], [element]);
    let options = {
      elementStyles: {
        sup: 'SUPERSCRIPT',
      },
    };
    let contentState = stateFromElement(wrapperElement, options);
    let rawContentState = removeBlockKeys(convertToRaw(contentState));
    expect(rawContentState).toEqual({
      entityMap: {},
      blocks: [
        {
          text: 'Superscript',
          type: 'unstyled',
          data: {},
          depth: 0,
          inlineStyleRanges: [{offset: 0, length: 11, style: 'SUPERSCRIPT'}],
          entityRanges: [],
        },
      ],
    });
  });

  it('should support images', () => {
    let imageNode = new ElementNode('img', [{name: 'src', value: 'imgur.com/asdf.jpg'}]);
    let wrapperElement = new ElementNode('div', [], [imageNode]);
    let contentState = stateFromElement(wrapperElement);
    let rawContentState = removeBlockKeys(convertToRaw(contentState));
    expect(rawContentState).toEqual({
      blocks: [{
        data: {},
        depth: 0,
        entityRanges: [{
          key: 0,
          length: 1,
          offset: 0,
        }],
        inlineStyleRanges: [],
        text: ' ',
        type: 'unstyled',
      }],
      entityMap: {
        // This is necessary due to flow not supporting non-string literal property keys
        // eslint-disable-next-line quote-props
        '0': {
          data: {
            src: 'imgur.com/asdf.jpg',
          },
          mutability: 'MUTABLE',
          type: 'IMAGE',
        },
      },
    });
  });
});

describe('stateFromHTML', () => {
  testCases.forEach((testCase) => {
    let {description, state, html} = testCase;
    it(`should render ${description}`, () => {
      let element = parseHTML(html);
      let actualState = removeBlockKeys(
        convertToRaw(stateFromElement(element)),
      );
      expect(actualState).toEqual(state);
    });
  });
});

function parseHTML(html: string): Element {
  if (document.documentElement) {
    document.documentElement.innerHTML = html;
  }
  // This makes Flow happy
  return document.body || document.createElement('body');
}

function removeBlockKeys(content: Object): Object {
  let newContent = {...content};
  newContent.blocks = content.blocks.map((block) => {
    let {key, ...other} = block; // eslint-disable-line no-unused-vars
    return other;
  });
  return newContent;
}
