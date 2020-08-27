// @flow
const {describe, it} = global;
import expect from 'expect';
import {convertFromRaw} from 'draft-js';
import stateToHTML from '../stateToHTML';
import fs from 'fs';
import {join} from 'path';

// This separates the test cases in `data/test-cases.txt`.
const SEP = '\n\n#';

let testCasesRaw = fs.readFileSync(
  join(__dirname, '..', '..', 'test', 'test-cases.txt'),
  'utf8',
);

// These test cases specify custom options also.
let testCasesCustomRaw = fs.readFileSync(
  join(__dirname, '..', '..', 'test', 'test-cases-custom.txt'),
  'utf8',
);

let testCases = testCasesRaw
  .slice(1)
  .trim()
  .split(SEP)
  .map((text) => {
    let lines = text.split('\n');
    let description = lines.shift().trim();
    let state = JSON.parse(lines.shift());
    let html = lines.join('\n');
    return {description, state, html};
  });

let testCasesCustom = testCasesCustomRaw
  .slice(1)
  .trim()
  .split(SEP)
  .map((text) => {
    let lines = text.split('\n');
    let description = lines.shift().trim();
    let options = JSON.parse(lines.shift());
    let state = JSON.parse(lines.shift());
    let html = lines.join('\n');
    return {description, options, state, html};
  });

describe('stateToHTML', () => {
  testCases.forEach((testCase) => {
    let {description, state, html} = testCase;
    it(`should render ${description}`, () => {
      let contentState = convertFromRaw(state);
      expect(stateToHTML(contentState)).toBe(html);
    });
  });

  testCasesCustom.forEach((testCase) => {
    let {description, options, state, html} = testCase;
    it(`should render ${description}`, () => {
      let contentState = convertFromRaw(state);
      expect(stateToHTML(contentState, options)).toBe(html);
    });
  });

  it('should support custom block renderer', () => {
    let options = {
      blockRenderers: {
        'code-block': (block) => {
          return `<div class="code">${block.getText()}</div>`;
        },
      },
    };
    let contentState = convertFromRaw(
      // <pre><code>Hello <em>world</em>.</code></pre>
      {
        entityMap: {},
        blocks: [
          {
            key: 'dn025',
            text: 'Hello world.',
            type: 'code-block',
            depth: 0,
            inlineStyleRanges: [{offset: 6, length: 5, style: 'ITALIC'}],
            entityRanges: [],
          },
        ],
      }, // eslint-disable-line
    );
    expect(stateToHTML(contentState, options)).toBe(
      '<div class="code">Hello world.</div>',
    );
    let contentState2 = convertFromRaw(
      // <h1>Hello <em>world</em>.</h1>
      {
        entityMap: {},
        blocks: [
          {
            key: 'dn025',
            text: 'Hello world.',
            type: 'header-one',
            depth: 0,
            inlineStyleRanges: [{offset: 6, length: 5, style: 'ITALIC'}],
            entityRanges: [],
          },
        ],
      }, // eslint-disable-line
    );
    expect(stateToHTML(contentState2, options)).toBe(
      '<h1>Hello <em>world</em>.</h1>',
    );
  });

  it('should support inline style function', () => {
    let options = {
      inlineStyleFn: (styles) => {
        let key = 'color-';
        let color = styles.filter((value) => value.startsWith(key)).first();

        if (color) {
          return {
            element: 'span',
            style: {
              color: color.replace(key, ''),
            },
          };
        }
      },
    };

    let contentState = convertFromRaw(
      //<p>Hello <span style="color: #f8b400">world</span></p>
      {
        entityMap: {},
        blocks: [{
          key: '7h6g0',
          text: 'Hello world',
          type: 'unstyled',
          depth: 0,
          inlineStyleRanges: [{offset: 6, length: 5, style: 'color-#f8b400'}],
          entityRanges: [],
          data: {},
        }],
      },
    );

    expect(stateToHTML(contentState, options)).toBe(
      '<p>Hello <span style="color: #f8b400">world</span></p>',
    );
  });

  it('should support custom block styles', () => {
    let options = {
      blockStyleFn: (block) => {
        let alignment = block.getData ? block.getData().get('alignment') : null;
        if (alignment) {
          return {
            style: {
              textAlign: alignment,
            },
          };
        }
      },
    };
    let contentState1 = convertFromRaw(
      // <h1 style="text-align: left;">Hello <em>world</em>.</h1>
      {
        entityMap: {},
        blocks: [
          {
            data: {alignment: 'left'},
            key: 'dn025',
            text: 'Hello world.',
            type: 'header-one',
            depth: 0,
            inlineStyleRanges: [{offset: 6, length: 5, style: 'ITALIC'}],
            entityRanges: [],
          },
        ],
      }, // eslint-disable-line
    );
    if (contentState1.getFirstBlock().getData == null) {
      // Older DraftJS does not support block.getData()
      return;
    }
    expect(stateToHTML(contentState1, options)).toBe(
      '<h1 style="text-align: left">Hello <em>world</em>.</h1>',
    );
    let contentState2 = convertFromRaw(
      // <h1>Hello <em>world</em>.</h1>
      {
        entityMap: {},
        blocks: [
          {
            key: 'dn025',
            text: 'Hello world.',
            type: 'header-one',
            depth: 0,
            inlineStyleRanges: [{offset: 6, length: 5, style: 'ITALIC'}],
            entityRanges: [],
          },
        ],
      }, // eslint-disable-line
    );
    expect(stateToHTML(contentState2, options)).toBe(
      '<h1>Hello <em>world</em>.</h1>',
    );
  });

  it('should support custom entity styles', () => {
    let options = {
      entityStyleFn: (entity) => {
        let entityType = entity.getType().toUpperCase();
        if (entityType === 'MENTION') {
          return {
            element: 'a',
            attributes: {
              href: `/users/${entity.getData()['userId']}`,
              class: 'mention',
            },
          };
        }
      },
    };
    let contentState1 = convertFromRaw(
      // <p><em>a</em></p>
      {
        entityMap: {
          [0]: {
            type: 'MENTION',
            mutability: 'MUTABLE',
            data: {userId: 'mikaelwaltersson'},
          },
        },
        blocks: [
          {
            key: '8r91j',
            text: 'a',
            type: 'unstyled',
            depth: 0,
            inlineStyleRanges: [{offset: 0, length: 1, style: 'ITALIC'}],
            entityRanges: [{offset: 0, length: 1, key: 0}],
          },
        ],
      }, // eslint-disable-line
    );
    if (contentState1.getFirstBlock().getData == null) {
      // Older DraftJS does not support block.getData()
      return;
    }
    expect(stateToHTML(contentState1, options)).toBe(
      '<p><a href="/users/mikaelwaltersson" class="mention"><em>a</em></a></p>',
    );
  });

  it('should support custom block tag', () => {
    let contentState = convertFromRaw(
      {
        entityMap: {},
        blocks: [{
          key: '33nh8',
          text: 'a',
          type: 'unstyled',
          depth: 0,
          inlineStyleRange: [],
          entityRanges: [],
        }],
      },
    );

    expect(stateToHTML(contentState)).toBe(
      '<p>a</p>',
    );

    expect(stateToHTML(contentState, {defaultBlockTag: 'h1'})).toBe(
      '<h1>a</h1>',
    );

    expect(stateToHTML(contentState, {defaultBlockTag: null})).toBe(
      'a',
    );
  });

  it('should support custom block tags map', () => {
    let contentState = convertFromRaw(
      {
        entityMap: {},
        blocks: [{
          key: '33nh8',
          text: 'text',
          type: 'unstyled',
          depth: 0,
          inlineStyleRange: [],
          entityRanges: [],
        }],
      },
    );

    expect(stateToHTML(contentState)).toBe(
      '<p>text</p>',
    );

    expect(stateToHTML(contentState, {
      blockTagsMap: {
        unstyled: 'h1',
      },
    })).toBe(
      '<h1>text</h1>',
    );
  });
});
