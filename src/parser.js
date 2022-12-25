const RESULT_UNRECOGNIZED = 0;
const RESULT_INVALID = 1;
const RESULT_VALID = 2;

class ParseContext {
    static RESULT_UNRECOGNIZED = RESULT_UNRECOGNIZED;
    static RESULT_INVALID = RESULT_INVALID;
    static RESULT_VALID = RESULT_VALID;

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

    atLiteral (str) {
        const l = this.text.length - this.pos;
        if ( str.length > l ) return false;
        return this.text.substr(this.pos, str.length) === str;
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

class QuotedStringParser {
    static CHAR_ESCAPES = {
        '"': '"',
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
                const b = ctx.headb;
                ctx.fwd();
                state = STATE_NORMAL;

                // if ( head in this.CHAR_ESCAPES ) {
                //     value += this.CHAR_ESCAPES[head];
                //     return;
                // }

                // Unrolling condition above shows 10% improvement in benchmark
                if ( head === '"' ) { value += '"'; return; }
                if ( head === 'b' ) { value += '\b'; return; }
                if ( head === 'f' ) { value += '\f'; return; }
                if ( head === 'n' ) { value += '\n'; return; }
                if ( head === 'r' ) { value += '\r'; return; }
                if ( head === 't' ) { value += '\t'; return; }
                if ( head === '\\' ) { value += '\\'; return; }
                if ( head === '/' ) { value += '/'; return; }

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

        if ( ! ctx.valid ) return ctx.unrecognized();

        if ( ctx.head == '-' ) {
            negativity *= -1;
            ctx.fwd();
        }

        if ( ctx.head < '0' || ctx.head > '9' ) {
            return ctx.unrecognized();
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
                    // According to JSON spec, a digit must follow
                    if ( ! ctx.valid || ctx.head < '0' || ctx.head > '9' ) {
                        return ctx.invalid('digit required after decimal point');
                    }
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

class ValueParser {
    static delegates = [
        QuotedStringParser,
        NumberParser,
        {
            parse: ctx => {
                const known = {true:true,false:false,null:null};
                for ( const keyword in known ) {
                    if ( ctx.atLiteral(keyword) ) {
                        ctx = ctx.clone();
                        ctx.fwd(keyword.length);
                        return ctx.result(known[keyword]);
                    }
                }
                return ctx.unrecognized();
            }
        }
    ];
    static parse(ctx) {
        ctx = ctx.clone();
        let value = undefined;
        {
            const result = WhitespaceParser.parse(ctx);
            ctx = result.ctx;
        }
        for ( const delegate of this.delegates ) {
            const result = delegate.parse(ctx);
            if ( result.result === ParseContext.RESULT_UNRECOGNIZED ) {
                continue;
            }
            if ( result.result === ParseContext.RESULT_INVALID ) {
                return result;
            }
            value = result.value;
            ctx = result.ctx;
            break;
        }
        if ( value === undefined ) return ctx.unrecognized();
        {
            const result = WhitespaceParser.parse(ctx);
            ctx = result.ctx;
        }
        return ctx.result(value);
    }
}

class ArrayParser {
    static parse (ctx) {
        if ( ctx.head !== '[' ) return ctx.unrecognized();
        ctx.fwd();

        const value = [];

        {
            const result = WhitespaceParser.parse(ctx);
            ctx = result.ctx;
        }

        let firstValue = true;

        while ( true ) {
            if ( ! ctx.valid ) {
                return ctx.invalid('unexpected end of string in array');
            }
            if ( ctx.head === ']' ) {
                ctx.fwd();
                return ctx.result(value);
            }
            if ( firstValue ) {
                firstValue = false;
            } else {
                if ( ctx.head !== ',' ) {
                    return ctx.invalid('missing comma in array');
                }
                ctx.fwd();
            }
            const result = ValueParser.parse(ctx);
            if ( result.result === RESULT_INVALID ) {
                return result;
            }
            if ( result.result === RESULT_UNRECOGNIZED ) {
                return ctx.invalid('non-value in array');
            }
            value.push(result.value);
            ctx = result.ctx;
        }
    }
}

ValueParser.delegates.push(ArrayParser);

class ObjectParser {
    static parse (ctx) {
        if ( ctx.head !== '{' ) return ctx.unrecognized();
        ctx.fwd();

        const value = {};

        {
            const result = WhitespaceParser.parse(ctx);
            ctx = result.ctx;
        }

        let firstValue = true;

        while ( true ) {
            if ( ! ctx.valid ) {
                return ctx.invalid('unexpected end of string in object');
            }

            if ( ctx.head === '}' ) {
                ctx.fwd();
                return ctx.result(value);
            }
            if ( firstValue ) {
                firstValue = false;
            } else {
                if ( ctx.head !== ',' ) {
                    return ctx.invalid('missing comma in object');
                }
                ctx.fwd();
                {
                    const result = WhitespaceParser.parse(ctx);
                    ctx = result.ctx;
                }
            }
            
            let key = '';
            {
                const result = QuotedStringParser.parse(ctx);
                if ( result.result === RESULT_INVALID ) {
                    return result;
                }
                if ( result.result === RESULT_UNRECOGNIZED ) {
                    return ctx.invalid('key must be string');
                }
                key = result.value;
                ctx = result.ctx;
            }
            {
                const result = WhitespaceParser.parse(ctx);
                ctx = result.ctx;
            }

            if ( ctx.head !== ':' ) {
                return ctx.invalid('expected colon in object');
            }
            ctx.fwd();

            let val = undefined;
            {
                const result = ValueParser.parse(ctx);
                if ( result.result === RESULT_INVALID ) {
                    return result;
                }
                if ( result.result === RESULT_UNRECOGNIZED ) {
                    return ctx.invalid('unrecognized value in object');
                }
                val = result.value;
                ctx = result.ctx;
            }

            value[key] = val;
        }
    }
}

ValueParser.delegates.push(ObjectParser);

const ObviousJSON = {};

ObviousJSON.parse = str => ObviousJSON.parsev(str).data;
ObviousJSON.parsev = str => {
    const ctx = new ParseContext(str);
    const result = ValueParser.parse(ctx);
    if ( result.result === RESULT_UNRECOGNIZED ) {
        throw new Error('value not recognized by a JSON value parser');
    }
    if ( result.result === RESULT_INVALID ) {
        throw new Error('parse error: ' + result.message);
    }
    return {
        data: result.value,
        length: result.ctx.pos
    };
}

ObviousJSON.ValueParser = ValueParser;

module.exports = {
    ObviousJSON,
    ParseContext,
    WhitespaceParser,
    NumberParser,
    QuotedStringParser,
    ValueParser,
    ArrayParser,
    ObjectParser,
}
