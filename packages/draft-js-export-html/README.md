# DraftJS: Export ContentState to HTML

This is a module for [DraftJS](https://github.com/facebook/draft-js) that will export your editor content to semantic HTML.

It was extracted from [React-RTE](https://react-rte.org) and placed into a separate module for more general use. Hopefully it can be helpful in your projects.

## Installation

    npm install --save draft-js-export-html

## How to Use

```javascript
import {stateToHTML} from 'draft-js-export-html';
let html = stateToHTML(contentState);
```

## Options

You can optionally pass a second "options" argument to `stateToHTML` which should be an object with one or more of the following properties:

### `inlineStyles`

You can define rendering options for inline styles. This applies to built-in inline styles (e.g. `BOLD`) or your own custom inline styles (e.g. `RED`). You can specify which element/tag name will be used (e.g. use `<b>` instead of `<strong>` for `BOLD`). You can add custom attributes (e.g. `class="foo"`) or add some styling (e.g. `color: red`).

Example:

```javascript
let options = {
  inlineStyles: {
    // Override default element (`strong`).
    BOLD: {element: 'b'},
    ITALIC: {
      // Add custom attributes. You can also use React-style `className`.
      attributes: {class: 'foo'},
      // Use camel-case. Units (`px`) will be added where necessary.
      style: {fontSize: 12}
    },
    // Use a custom inline style. Default element is `span`.
    RED: {style: {color: '#900'}},
  },
};
let html = stateToHTML(contentState, options);
```
### `inlineStyleFn`

You can define custom function to return rendering options based on inline styles. Similar to draft.js [customStyleFn](https://draftjs.org/docs/api-reference-editor.html#customstylefn).

Example:

```javascript
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
let html = stateToHTML(contentState, options);
```

### `blockRenderers`

You can define a custom renderer for any block type. Pass a function that accepts `block` as an argument. You can return a string to render this block yourself, or return nothing (null or undefined) to defer to the default renderer.

Example:

```javascript
let options = {
  blockRenderers: {
    atomic: (block) => {
      let data = block.getData();
      if (data.get('foo') === 'bar') {
        return '<div>' + escape(block.getText()) + '</div>';
      }
    },
  },
};
let html = stateToHTML(contentState, options);
```

### `defaultBlockTag`

If you don't want to define the full custom render for a block, you can define the type of the parent block tag that will be created if the block type doesn't match any known type.

If you don't want any parent block tag, you can set `defaultBlockTag` to `null`.

Example:

```javascript
let options = {
  defaultBlockTag: 'div',
};
let html = stateToHTML(contentState, options);
```

### `blockStyleFn`

You can define custom styles and attributes for your block, utilizing the underlying built-in rendering logic of the tags, but adding your own attributes or styles on top. The `blockStyleFn` option takes a block and returns an Object similar to `inlineStyles` of the following signature or null:

```js
{
  attributes: {}
  style: {}
}
```

Example:
```js
let options = {
  blockStyleFn: (block) => {
    if (block.getData().get('color')) {
      return {
        style: {
          color: block.getData().get('color'),
        },
      }
    }
  }
}
let html = stateToHTML(contentState, options);
```

### `entityStyleFn`

It is passed an [`entity`](https://draftjs.org/docs/api-reference-entity.html) object
and should return an entityStyle object in the shape of:

```js
{
  element: 'element', // name of DOM element as a string
  attributes: {},
  style: {}
}
```

Example:

```js
let options = {
  entityStyleFn: (entity) => {
    const entityType = entity.get('type').toLowerCase();
    if (entityType === 'image') {
      const data = entity.getData();
      return {
        element: 'img',
        attributes: {
          src: data.src,
        },
        style: {
          // Put styles here...
        },
      };
    }
  },
};
let html = stateToHTML(contentState, options);
```

## Contributing

If you want to help out, please open an issue to discuss or join us on [Slack](https://draftjs.herokuapp.com/).

## License

This software is [BSD Licensed](/LICENSE).
