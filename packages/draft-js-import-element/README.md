# DraftJS: Import Element to ContentState

This is a module for [DraftJS](https://github.com/facebook/draft-js) that will convert an HTML DOM Element to editor content.

It was extracted from [React-RTE](https://react-rte.org) and placed into a separate module for more general use. Hopefully it can be helpful in your projects.

## Installation

    npm install --save draft-js-import-element

This project is still under development. If you want to help out, please open an issue to discuss or join us on [Slack](https://draftjs.slack.com/).

## Usage

`stateFromElement` takes a DOM node `element` and returns a DraftJS [ContentState](https://facebook.github.io/draft-js/docs/api-reference-content-state.html).

```js
import {stateFromElement} from 'draft-js-import-element';
const contentState = stateFromElement(element);
```

### Options

You can optionally pass a second `Object` argument to `stateFromElement` with the following supported properties:

- `customBlockFn`: Function to specify block type/data based on HTML element. Example:
```js
let options = {
  // Should return null/undefined or an object with optional: type (string); data (plain object)
  customBlockFn: (element) => {
    if (element.tagName === 'ARTICLE') {
      return {type: 'custom-block-type'};
    }
    if (element.tagName === 'CENTER') {
      return {data: {align: 'center'}};
    }
  },
};
let contentState = stateFromElement(element, options);
```

- `customInlineFn`: Function to specify how inline elements are handled. Example:

```js
let options = {
  // Should return a Style() or Entity() or null/undefined
  customInlineFn: (element, {Style, Entity}) => {
    if (element.tagName === 'SPAN' && element.className === 'emphasis') {
      return Style('ITALIC');
    } else if (element.tagName === 'IMG') {
      return Entity('IMAGE', {src: element.getAttribute('src')});
    }
  },
};
let contentState = stateFromElement(element, options);
```

- `elementStyles`: HTML element name as key, DraftJS style string as value. Example:
```js
stateFromElement(element, {
  elementStyles: {
    // Support `<sup>` (superscript) inline element:
    'sup': 'SUPERSCRIPT',
  },
});
```

- `inlineElements`: Array of (lowercase) tag names which should be handled as inline tags. Example:
```js
stateFromElement(element, {
  inlineElements: ['my-first-custom-tag', 'my-second-custom-tag']
});
```

## License

This software is [BSD Licensed](/LICENSE).
