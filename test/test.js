const assert = require('assert');
const { QuotedStringParser, ParseContext, WhitespaceParser, NumberParser } = require("../src/parser")

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
