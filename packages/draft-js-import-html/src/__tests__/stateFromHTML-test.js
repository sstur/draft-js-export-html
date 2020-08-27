// @flow
const {describe, it} = global;
import expect from 'expect';
import * as fs from 'fs';
import * as path from 'path';
import stateFromHTML from '../stateFromHTML';
import parseHTML from '../parseHTML';
import {convertToRaw} from 'draft-js';

describe('stateFromHTML', () => {
  describe('state from complex HTML structure with single paragraph', () => {
    let file = path.resolve(__dirname, 'fixtures/large-single-paragraph.html');
    let html = fs.readFileSync(file);

    it('should create content state from complex HTML structure', () => {
      let contentState = stateFromHTML(html.toString());
      let rawContentState = convertToRaw(contentState);
      let blocks = removeKeys(rawContentState.blocks);
      expect(blocks.length).toEqual(1);
    });
  });

  describe('state from complex HTML structure with multiple paragraphs', () => {
    let file = path.resolve(__dirname, 'fixtures/large-multiple-paragraphs.html');
    let html = fs.readFileSync(file);

    it('should create content state from complex HTML structure', () => {
      let contentState = stateFromHTML(html.toString());
      let rawContentState = convertToRaw(contentState);
      let blocks = removeKeys(rawContentState.blocks);
      expect(blocks.length).toEqual(96);
    });
  });

  describe('simple HTML structure', () => {
    let html = '<p>Hello World</p>';

    it('should create content state', () => {
      let contentState = stateFromHTML(html);
      let rawContentState = convertToRaw(contentState);
      let blocks = removeKeys(rawContentState.blocks);
      expect(blocks).toEqual([
        {
          text: 'Hello World',
          type: 'unstyled',
          data: {},
          depth: 0,
          inlineStyleRanges: [],
          entityRanges: [],
        },
      ]);
    });

    it('should accept a custom parser', () => {
      let calledWith = [];
      let customParser = (...args) => {
        calledWith.push(args);
        return parseHTML(...args);
      };
      let options = {parser: customParser};
      let contentState = stateFromHTML(html, options);
      expect(calledWith.length).toBe(1);
      expect(calledWith[0].length).toBe(1);
      expect(calledWith[0][0]).toBe(html);
      let rawContentState = convertToRaw(contentState);
      let blocks = removeKeys(rawContentState.blocks);
      expect(blocks).toEqual([
        {
          text: 'Hello World',
          type: 'unstyled',
          data: {},
          depth: 0,
          inlineStyleRanges: [],
          entityRanges: [],
        },
      ]);
    });
  });
});

function removeKeys(blocks) {
  return blocks.map((block) => {
    let {key, ...other} = block; // eslint-disable-line no-unused-vars
    return other;
  });
}
