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

    get headb () {
        return this.text.charCodeAt(this.pos);
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

class NumberParser {
    static parse (ctx) {
        ctx = ctx.clone();
        let negativity = 1;
        let fractional = 1;
        let value = 0;

        let expValue = 0;
        let expNegativity = 1;

        if ( ctx.head == '-' ) {
            negativity *= -1;
            ctx.fwd();
        }

        let state;
        let STATE_JUST_BEFORE_FRACTIONAL, STATE_FRACTIONAL;
        let STATE_JUST_BEFORE_EXP, STATE_EXP_Z, STATE_EXP;
        let STATE_INTEGRAL;
        STATE_JUST_BEFORE_FRACTIONAL = {
            parse_: () => {
                if ( ctx.head == '.' ) {
                    ctx.fwd();
                    state = STATE_FRACTIONAL;
                    return;
                }
                state = STATE_JUST_BEFORE_EXP;
            }
        };
        STATE_INTEGRAL = {
            parse_: () => {
                if ( ! ctx.valid || ctx.head < '0' || ctx.head > '9' ) {
                    state = STATE_JUST_BEFORE_FRACTIONAL;
                    return;
                }
                value *= 10;
                value += ctx.head - '0';
                ctx.fwd()
            }
        };
        STATE_FRACTIONAL = {
            parse_: () => {
                if ( ! ctx.valid || ctx.head < '0' || ctx.head > '9' ) {
                    state = STATE_JUST_BEFORE_EXP;
                    return;
                }
                fractional /= 10;
                value += fractional * (ctx.head - '0');
                ctx.fwd();
            }
        }
        STATE_JUST_BEFORE_EXP = {
            parse_: () => {
                const e = String.fromCharCode(ctx.headb | 0x20);
                if ( e !== 'e' ) {
                    return ctx.result(value * negativity);
                }

                ctx.fwd();
                if ( ctx.head === '-' ) expNegativity = -1;
                if ( ctx.head === '-' || ctx.head === '+' ) {
                    ctx.fwd();
                }

                state = STATE_EXP_Z;
            }
        }
        // JSON spec allows an arbitrary number of leading zeros
        // before the exponent. This is inconsistent with the
        // integral part of the number.
        STATE_EXP_Z = {
            parse_: () => {
                if ( ctx.head === '0' ) ctx.fwd();
                else state = STATE_EXP;
            }
        }
        STATE_EXP = {
            parse_: () => {
                if ( ! ctx.valid || ctx.head < '0' || ctx.head > '9' ) {
                    if ( expNegativity > 0 ) {
                        value *= Math.pow(10, expValue);
                    } else {
                        value /= Math.pow(10, expValue);
                    }
                    return ctx.result(value);
                }

                expValue *= 10;
                expValue += ctx.head - '0';
                ctx.fwd();
            }
        };

        if ( ctx.head === '0' ) {
            ctx.fwd();
            state = STATE_JUST_BEFORE_FRACTIONAL;
        } else {
            state = STATE_INTEGRAL;
        }

        while (true) {
            const end = state.parse_();
            if ( end ) return end;
        }
    }
}

class WhitespaceParser {
    static WHITESPACE_CHARS = ' \n\r\t'
    static parse (ctx) {
        if ( this.WHITESPACE_CHARS.includes(ctx.head) ) {
            ctx = ctx.clone();
            ctx.fwd();
        }
        while ( this.WHITESPACE_CHARS.includes(ctx.head) ) {
            ctx.fwd();
        }
        return ctx.result(undefined);
    }
}

const ObviousJSON = {};

ObviousJSON.parse = str => ObviousJSON.parsev(str).value;
ObviousJSON.parsev = str => {}

module.exports = {
    ObviousJSON,
    ParseContext,
    WhitespaceParser,
    NumberParser,
    QuotedStringParser
}
