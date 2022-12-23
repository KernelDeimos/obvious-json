const assert = require('assert');
const { QuotedStringParser, ParseContext, WhitespaceParser, NumberParser, ValueParser, ArrayParser, ObjectParser } = require("../src/parser")

const round = (value, m) => Math.round(value * m) / m;

describe('quoted string parser', function () {
    const testCases = [];

    const tryEdgeCases = tc => {
        testCases.push({ // Edge case: last token
            ...tc,
            input: '"aaa' + tc.input + '"',
            expected: 'aaa' + tc.expected
        });
        testCases.push({ // try token in the middle
            ...tc,
            input: '"aa' + tc.input + 'zz"',
            expected: 'aa' + tc.expected + 'zz'
        });
        testCases.push({ // Edge case: first token
            ...tc,
            input: '"' + tc.input + 'zzz"',
            expected: tc.expected + 'zzz'
        });
        testCases.push({ // Edge case: twice in a row
            input: '"' + tc.input + tc.input + '"',
            expected: tc.expected + tc.expected
        })
    };

    tryEdgeCases({
        input: '\\t',
        expected: '\t'
    });
    tryEdgeCases({
        input: '\\\"',
        expected: '\"'
    });
    tryEdgeCases({
        input: '\\u00E9',
        expected: '\u00e9'
    });

    for ( const tc of testCases ) {
        it('works for: ' + tc.input, function () {
            const ctx = new ParseContext(tc.input, 0);
            const result = QuotedStringParser.parse(ctx)
            assert.equal(result.value, tc.expected);
        })
    }
})

describe('whitespace parser', function () {
    it('does nothing when there\'s no whitespace', function () {
        let ctx = new ParseContext('abc', 1);
        ctx = WhitespaceParser.parse(ctx).ctx;
        assert.equal(ctx.head, 'b');
    })
    it('advances all whitespace characters', function () {
        let ctx = new ParseContext('a \r\n\tbc', 1);
        ctx = WhitespaceParser.parse(ctx).ctx;
        assert.equal(ctx.head, 'b');
    })
})

describe('number parser', function () {
    it('parses integer', function () {
        let ctx = new ParseContext('123');
        const result = NumberParser.parse(ctx);
        assert.equal(result.value, 123);
    })
    it('parses fraction (> 1)', function () {
        let ctx = new ParseContext('1.5');
        const result = NumberParser.parse(ctx);
        assert.equal(result.value, 1.5);
    })
    it('parses fraction (< 1)', function () {
        let ctx = new ParseContext('0.5');
        const result = NumberParser.parse(ctx);
        assert.equal(result.value, 0.5);
    })
    it('parses negative value', function () {
        let ctx = new ParseContext('-1.1');
        const result = NumberParser.parse(ctx);
        assert.equal(result.value, -1.1);
    })

    it('parses positive exponent', function () {
        let ctx = new ParseContext('1.1e1');
        const result = NumberParser.parse(ctx);
        assert.equal(result.value, 11);
    })
    it('parses negative exponent', function () {
        let ctx = new ParseContext('1.1e-1');
        const result = NumberParser.parse(ctx);
        let value = result.value;
        // Precision should be set to the highest value before the text fails
        value = round(value, Math.pow(10, 16));
        assert.equal(value, 0.11);
    })
    it('parses positive exponent with leading zeros', function () {
        let ctx = new ParseContext('1.1e001');
        const result = NumberParser.parse(ctx);
        assert.equal(result.value, 11);
    })
    it('parses negative exponent with leading zeros', function () {
        let ctx = new ParseContext('1.1e-001');
        const result = NumberParser.parse(ctx);
        let value = result.value;
        // Precision should be set to the highest value before the text fails
        value = round(value, Math.pow(10, 16));
        assert.equal(value, 0.11);
    })
    it('reports unrecognized on empty string', function () {
        let ctx = new ParseContext('');
        const result = NumberParser.parse(ctx);
        assert.equal(result.result, ParseContext.RESULT_UNRECOGNIZED);
    })
    it('reports unrecognized on double-quote', function () {
        let ctx = new ParseContext('"');
        const result = NumberParser.parse(ctx);
        assert.equal(result.result, ParseContext.RESULT_UNRECOGNIZED);
    })
    it('reports invalid on 1.e1', function () {
        let ctx = new ParseContext('1.e1');
        const result = NumberParser.parse(ctx);
        assert.equal(result.result, ParseContext.RESULT_INVALID);
    })
})

describe('value parser', function () {
    it('parses a string', function () {
        let ctx = new ParseContext('  "string"  ');
        const result = ValueParser.parse(ctx);
        assert.equal(result.value, 'string');
        assert.equal(result.ctx.valid, false);
    })
    it('parses a number', function () {
        let ctx = new ParseContext('  5  ');
        const result = ValueParser.parse(ctx);
        assert.equal(result.value, 5);
        assert.equal(result.ctx.valid, false);
    })
    it('parses a keyword', function () {
        let ctx = new ParseContext('  true  ');
        const result = ValueParser.parse(ctx);
        assert.equal(result.value, true);
    })
    it('parses an array', function () {
        let ctx = new ParseContext('  ["a", 5]  ');
        const result = ValueParser.parse(ctx);
        assert.deepEqual(result.value, ["a", 5]);
        assert.equal(result.ctx.valid, false);
    })
    it('parses an object', function () {
        let ctx = new ParseContext('  {"a": 5}  ');
        const result = ValueParser.parse(ctx);
        assert.deepEqual(result.value, {"a": 5});
        assert.equal(result.ctx.valid, false);
    })
    it('stops parsing before another token', function () {
        let ctx = new ParseContext('  5  "test"  ');
        const result = ValueParser.parse(ctx);
        assert.equal(result.value, 5);
        assert.equal(result.ctx.valid, true);
    })
})

describe('array parser', function () {
    it('parses one value', function () {
        let ctx = new ParseContext('["a"]');
        const result = ArrayParser.parse(ctx);
        assert.deepEqual(result.value, ['a']);
    })
    it('parses empty array', function () {
        let ctx = new ParseContext('[]');
        const result = ArrayParser.parse(ctx);
        assert.deepEqual(result.value, []);
    })
    it('parses multiple values', function () {
        let ctx = new ParseContext('["a", "b"]');
        const result = ArrayParser.parse(ctx);
        assert.deepEqual(result.value, ['a', 'b']);
    })
    it('reports invalid on missing comma', function () {
        let ctx = new ParseContext('["a" "b"]');
        const result = ArrayParser.parse(ctx);
        assert.equal(result.result, ParseContext.RESULT_INVALID);
    })
    it('reports invalid on trailing comma', function () {
        let ctx = new ParseContext('["a", "b", ]');
        const result = ArrayParser.parse(ctx);
        assert.equal(result.result, ParseContext.RESULT_INVALID);
    })
    it('allows whitespace between all syntax characters', function () {
        let ctx = new ParseContext('[ "a" , "b" ]');
        const result = ArrayParser.parse(ctx);
        assert.deepEqual(result.value, ['a', 'b']);
    })
    it('ends after closing bracket', function () {
        let ctx = new ParseContext('[ "a" , "b" ]');
        const result = ArrayParser.parse(ctx);
        assert.equal(result.ctx.valid, false);
    })
})

describe('object parser', function () {
    it('parses single key-value pair', function () {
        let ctx = new ParseContext('{"a": 5}');
        const result = ObjectParser.parse(ctx);
        if ( result.result !== ParseContext.RESULT_VALID ) {
            console.log(result);
        }
        assert.deepEqual(result.value, {"a": 5});
    })
    it('parses empty object', function () {
        let ctx = new ParseContext('{}');
        const result = ObjectParser.parse(ctx);
        assert.deepEqual(result.value, {});
    })
    it('parses multiple values', function () {
        let ctx = new ParseContext('{"a": 1, "b": 2}');
        const result = ObjectParser.parse(ctx);
        assert.deepEqual(result.value, {a: 1, b: 2});
    })
    it('reports invalid on missing comma', function () {
        let ctx = new ParseContext('{"a": 1 "b": 2}');
        const result = ObjectParser.parse(ctx);
        assert.equal(result.result, ParseContext.RESULT_INVALID);
    })
    it('reports invalid on trailing comma', function () {
        let ctx = new ParseContext('{"a": 1, "b": 2, }');
        const result = ObjectParser.parse(ctx);
        assert.equal(result.result, ParseContext.RESULT_INVALID);
    })
    it('allows whitespace between all syntax characters', function () {
        let ctx = new ParseContext('{ "a" : 1 , "b" : 2 }');
        const result = ObjectParser.parse(ctx);
        assert.deepEqual(result.value, {a: 1, b: 2});
    })
    it('ends after closing bracket', function () {
        let ctx = new ParseContext('{ "a" : 1 , "b" : 2 }');
        const result = ObjectParser.parse(ctx);
        assert.equal(result.ctx.valid, false);
    })
})
