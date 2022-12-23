const assert = require('assert');
const { QuotedStringParser, ParseContext } = require("../src/parser")

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