const RESULT_UNRECOGNIZED = 0;
const RESULT_INVALID = 1;
const RESULT_VALID = 2;

class ParseContext {
    constructor (text, pos) {
        this.text = text;
        this.pos = pos || 0;
    }

    get head () {
        return this.text[this.pos];
    }

    clone () {
        return new ParseContext(this.text, this.pos);
    }

    fwd (n) {
        this.pos += n || 1;
    }

    eat (n) {
        n = n || 1;
        const str = this.text.slice(this.pos, this.pos + n);
        this.fwd(n);
        return str;
    }

    get valid () {
        return this.pos < this.text.length;
    }

    result (value) {
        return {
            result: RESULT_VALID,
            ctx: this,
            value
        }
    }

    unrecognized () { return { result: RESULT_UNRECOGNIZED }; }

    invalid (message, fields) {
        return {
            result: RESULT_INVALID,
            message,
            fields
        }
    }
}

class Parser {}

class QuotedStringParser {
    static CHAR_ESCAPES = {
        b: '\n',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
        '\\': '\\',
        // JSON spec says escaping forward solidus is always valid.
        // It makes me a little upset, but I'll follow the spec.
        '/': '/'
    };

    static parse (ctx) {
        if ( ctx.head != '"' ) return ctx.unrecognized();
        ctx = ctx.clone();
        ctx.fwd();

        let value = '';

        let state, STATE_NORMAL, STATE_ESCAPE;
        STATE_NORMAL = {
            parse_: () => {
                const head = ctx.head;
                ctx.fwd()

                if ( head == '"' ) {
                    return ctx.result(value);
                }
                if ( head == '\\' ) {
                    state = STATE_ESCAPE;
                    return;
                }

                value += head;
            }
        }
        STATE_ESCAPE = {
            parse_: () => {
                const head = ctx.head;
                ctx.fwd();
                state = STATE_NORMAL;

                if ( head in this.CHAR_ESCAPES ) {
                    value += this.CHAR_ESCAPES[head];
                    return;
                }

                if ( head === 'u' ) {
                    const code = ctx.eat(4);
                    if ( code.length < 4 ) return this.invalid(
                        'invalid unicode escape near end of string',
                        { subject: code }
                    );

                    const codeNumber = Number.parseInt(code, 16);
                    if ( Number.isNaN(codeNumber) ) return this.invalid(
                        'invalid unicode escape', { subject: code }
                    );

                    value += String.fromCharCode(codeNumber)
                    return;
                }

                // According to JSON spec, the escape is invalid if we reach
                // this line. However, javascript's builtin JSON parser doesn't
                // throw an error here so we're just gonna...
                value += head;
            }
        }

        state = STATE_NORMAL;
        while ( ctx.valid ) {
            const end = state.parse_();
            if ( end ) return end;
        }

        return ctx.invalid('unexpected end of string');
    }
}


const ObviousJSON = {};

ObviousJSON.parse = str => ObviousJSON.parsev(str).value;
ObviousJSON.parsev = str => {}

module.exports = {
    ObviousJSON,
    ParseContext,
    QuotedStringParser
}
