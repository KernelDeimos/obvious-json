# Obvious JSON Parser

This lets you get JSON values and ignore arbitrary trailing text.

```javascript
const obviously = require('obvious-json');

obviously.parse('{"a": 5}this-text-is-ignored'); // { a: 5 }
obviously.parse('{"a": 5}{"b": 6}');             // { a: 5 }

```

## You can use this for streaming, or within other parsers

If you're streaming JSON objects, you can use `parsev` to get the length of the
value that was parsed:

```javascript
obviously.parsev('{"a": 5}{"b": 6}'); // { data: { a: 5 }, length: 8 }
```

It follows that you can use this within a lexer or a
[parser library that uses composition](https://github.com/kgrgreer/foam3/blob/development/src/foam/parse/parse.js).

## There's some backstory behind this

This package is called `obvious-json` because I think this behaviour is obvious.

Let me explain;

Any JSON value has an unambiguous ending. Therefore, it should be possible to
parse a valid JSON object in any string when the starting position of this JSON
object is known. That means you can have any garbage, or another JSON object,
trailing a valid JSON object and still parse it.

The JSON parser built into javascript will even report an error with the
end position included when there's trailing text,
but I [didn't want to resort to this nonsense](https://stackoverflow.com/questions/67271974/how-to-json-parse-ignoring-suffix-after-object).
Why this simple feature doesn't exist in the builtin parser is beyond what my
imagination can conjure.

Any alternate JSON implementation I found, such as streaming parsers, either
didn't have an obvious way to get just a single value or had an entirely different
purpose such as preservation of comments.
