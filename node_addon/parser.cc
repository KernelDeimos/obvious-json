// hello.cc
#include <node.h>
#include <math.h>
#include <iostream>
#include <string>

namespace demo {

using v8::FunctionCallbackInfo;
using v8::Isolate;
using v8::Local;
using v8::Object;
using v8::String;
using v8::Number;
using v8::Boolean;
using v8::Null;
using v8::Value;
using v8::Exception;
using v8::Array;
using std::string;
using std::cout;

enum ParseStatus {
    UNRECOGNIZED,
    INVALID,
    VALID
};

class ParserContext;

struct ParseResult {
    ParseStatus status;
    string message;
    Local<Value> value;
    ParserContext* ctx;
};

class ParserContext {
    public:
        string text;
        long unsigned int pos;
        ParserContext(string);
        ParserContext(string, long unsigned int);
        char getHead();
        bool atLiteral(string);
        ParserContext* clone();
        void fwd();
        void fwd(int);
        string eat(int);
        bool isValid();
        ParseResult result(Local<Value>);
        ParseResult unrecognized();
        ParseResult nothing();
        ParseResult invalid(string);
};

ParserContext::ParserContext(string text) {
    this->text = text;
    this->pos = 0;
}

ParserContext::ParserContext(string text, long unsigned int pos) {
    this->text = text;
    this->pos = pos;
}

char ParserContext::getHead() {
    return this->text[this->pos];
}

bool ParserContext::atLiteral(string str) {
    int l = this->text.length() - this->pos;
    int L = str.length();
    if ( L > l ) return false;
    for ( int i = 0 ; i < L ; i++ ) {
        if ( str[i] != this->text[this->pos + i] ) return false;
    }
    return true;
}

ParserContext* ParserContext::clone () {
    return new ParserContext(this->text, this->pos);
}

void ParserContext::fwd () { this->pos++; }
void ParserContext::fwd (int n) { this->pos += n; }

string ParserContext::eat(int n) {
    string str = this->text.substr(this->pos, n);
    this->fwd(n);
    return str;
}

bool ParserContext::isValid() {
    return this->pos < this->text.length();
}

ParseResult ParserContext::result (Local<Value> value) {
    ParseResult result;
    result.status = VALID;
    result.value = value;
    result.ctx = this;
    return result;
}

ParseResult ParserContext::unrecognized () {
    ParseResult result;
    result.status = UNRECOGNIZED;
    return result;
}

ParseResult ParserContext::nothing () {
    ParseResult result;
    result.status = VALID;
    result.ctx = this;
    return result;
}

ParseResult ParserContext::invalid (string message) {
    ParseResult result;
    result.status = INVALID;
    result.message = message;
    return result;
}

class Parser {
    public:
        Isolate* isolate;
        virtual ParseResult parse(ParserContext* ctx);
};

class QuotedStringParser: public Parser {
    public:
        ParseResult parse(ParserContext* ctx) override;
        QuotedStringParser (Isolate* isolate) {
            this->isolate = isolate;
        };
};
ParseResult QuotedStringParser::parse (ParserContext* ctx) {
    if ( ctx->getHead() != '"' ) return ctx->unrecognized();
    ctx = ctx->clone();
    ctx->fwd();

    string value = "";

    int state;
    constexpr int NORMAL = 0;
    constexpr int ESCAPE = 1;

    state = NORMAL;
    while ( ctx->isValid() ) {
        switch (state) {
            case NORMAL: {
                char head = ctx->getHead();
                ctx->fwd();

                if ( head == '"' ) {
                    return ctx->result(
                        Local<Value>(
                            String::NewFromUtf8(this->isolate, value.c_str())
                            .ToLocalChecked()
                        )
                    );
                }
                if ( head == '\\' ) {
                    state = ESCAPE;
                    continue;
                }

                value += head;
                break;
            }
            case ESCAPE: {
                char head = ctx->getHead();
                ctx->fwd();
                state = NORMAL;

                if ( head == '"' ) { value += '"'; continue; }
                if ( head == 'b' ) { value += '\b'; continue; }
                if ( head == 'f' ) { value += '\f'; continue; }
                if ( head == 'n' ) { value += '\n'; continue; }
                if ( head == 'r' ) { value += '\r'; continue; }
                if ( head == 't' ) { value += '\t'; continue; }
                if ( head == '\\' ) { value += '\\'; continue; }
                if ( head == '/' ) { value += '/'; continue; }

                // According to JSON spec, the escape is invalid if we reach
                // this line. However, javascript's builtin JSON parser doesn't
                // throw an error here so we're just gonna...
                value += head;
                break;
            }
        }
    }

    return ctx->invalid("unexpected end of string");
}
class NumberParser: public Parser {
    public:
        ParseResult parse(ParserContext* ctx) override;
        NumberParser (Isolate* isolate) {
            this->isolate = isolate;
        };
};
ParseResult NumberParser::parse (ParserContext* ctx) {
    ctx = ctx->clone();
    int negativity = 1;
    double fractional = 1;
    double value = 0;
    double expValue = 0;
    double expNegativity = 1;

    if ( ! ctx->isValid() ) return ctx->unrecognized();

    char head = ctx->getHead();
    if ( head == '-' ) {
        negativity = -1;
        ctx->fwd();
    }

    head = ctx->getHead();
    if ( head < '0' || head > '9' ) {
        return ctx->unrecognized();
    }

    int state;
    constexpr int STATE_JUST_BEFORE_FRACTIONAL = 1;
    constexpr int STATE_FRACTIONAL = 2;
    constexpr int STATE_JUST_BEFORE_EXP = 3;
    constexpr int STATE_EXP_Z = 4;
    constexpr int STATE_EXP = 5;
    constexpr int STATE_INTEGRAL = 6;

    if ( ctx->getHead() == '0' ) {
        ctx->fwd();
        state = STATE_JUST_BEFORE_FRACTIONAL;
    } else {
        state = STATE_INTEGRAL;
    }

    for ( ;; ) {
        cout << "NumberParser\n";
        switch ( state ) {
            case STATE_JUST_BEFORE_FRACTIONAL: {
                if ( ctx->getHead() == '.' ) {
                    ctx->fwd();
                    state = STATE_FRACTIONAL;
                    // According to JSON spec, a digit must follow
                    head = ctx->getHead();
                    if ( ! ctx->isValid() || head < '0' || head > '9' ) {
                        return ctx->invalid("digit required after decimal point");
                    }
                    break;
                }
                state = STATE_JUST_BEFORE_EXP;
            } break;
            case STATE_INTEGRAL: {
                head = ctx->getHead();
                if ( ! ctx->isValid() || head < '0' || head > '9' ) {
                    state = STATE_JUST_BEFORE_FRACTIONAL;
                    break;
                }
                value *= 10;
                value += head - '0';
                ctx->fwd();
            } break;
            case STATE_FRACTIONAL: {
                head = ctx->getHead();
                if ( ! ctx->isValid() || head < '0' || head > '9' ) {
                    state = STATE_JUST_BEFORE_EXP;
                    break;
                }
                fractional /= 10;
                value += fractional * (head - '0');
                ctx->fwd();
            } break;
            case STATE_JUST_BEFORE_EXP: {
                head = ctx->getHead();
                if ( head != 'e' && head != 'E' ) {
                    return ctx->result(
                        Number::New(isolate, value * negativity)
                    );
                }

                ctx->fwd();
                head = ctx->getHead();
                if ( head == '-' ) expNegativity = -1;
                if ( head == '-' || head == '+' ) {
                    ctx->fwd();
                }

                state = STATE_EXP_Z;
            } break;
            // JSON spec allows an arbitrary number of leading zeros
            // before the exponent. This is inconsistent with the
            // integral part of the number.
            case STATE_EXP_Z: {
                if ( ctx->getHead() == '0' ) ctx->fwd();
                else state = STATE_EXP;
            } break;
            case STATE_EXP: {
                head = ctx->getHead();
                if ( ! ctx->isValid() || head < '0' || head > '9' ) {
                    if ( expNegativity > 0 ) {
                        value *= pow(10, expValue);
                    } else {
                        value /= pow(10, expValue);
                    }
                    return ctx->result(
                        Number::New(isolate, value * negativity)
                    );
                }

                expValue *= 10;
                expValue += head - '0';
                ctx->fwd();
            }
        }
    }
}

class WhitespaceParser {
    public:
        Isolate* isolate;
        ParseResult parse(ParserContext* ctx);
        WhitespaceParser (Isolate* isolate) {
            this->isolate = isolate;
        };
};

ParseResult WhitespaceParser::parse(ParserContext* ctx) {
    if ( ! ctx->isValid() ) return ctx->nothing();
    char head = ctx->getHead();
    if (
        head == ' ' || head == '\n' ||
        head == '\r' || head == '\t'
    ) {
        ctx = ctx->clone();
        ctx->fwd();
    }
    while ( ctx->isValid() ) {
        cout << "whitespace\n";
        head = ctx->getHead();
        if (
            head != ' ' && head != '\n' &&
            head != '\r' && head != '\t'
        ) break;
        ctx->fwd();
    }
    return ctx->nothing();
}

class ArrayParser: public Parser {
    public:
        ParseResult parse(ParserContext* ctx) override;
        WhitespaceParser* pws;
        Parser* pvalue;
        ArrayParser (Isolate* isolate, Parser* pvalue) {
            this->isolate = isolate;
            this->pvalue = pvalue;
            this->pws = new WhitespaceParser(isolate);
        };
        ~ArrayParser () {
            delete this->pws;
        };
};

ParseResult ArrayParser::parse(ParserContext* ctx) {
    if ( ! ctx->isValid() ) return ctx->unrecognized();
    if ( ctx->getHead() != '[' ) return ctx->unrecognized();
    ctx = ctx->clone();
    ctx->fwd();

    uint32_t top = 0;
    Local<Array> value = Array::New(this->isolate);

    {
        ParseResult result = this->pws->parse(ctx);
        ctx = result.ctx;
    }

    bool firstValue = true;

    for ( ;; ) {
        cout << "ArrayParser\n";
        if ( ! ctx->isValid() ) {
            return ctx->invalid("unexpected end of string in array");
        }
        if ( ctx->getHead() == ']' ) {
            ctx->fwd();
            return ctx->result(value);
        }
        if (firstValue) {
            firstValue = false;
        } else {
            if (ctx->getHead() != ',') {
                return ctx->invalid("missing comma in array");
            }
            ctx->fwd();
        }

        ParseResult result = this->pvalue->parse(ctx);
        if ( result.status == INVALID ) return result;
        if ( result.status == UNRECOGNIZED ) {
            return ctx->invalid("non-value in array");
        }

        value->Set(
            this->isolate->GetCurrentContext(),
            top++,
            result.value
        );
        ctx = result.ctx;
    }
}

class ObjectParser: public Parser {
    public:
        ParseResult parse(ParserContext* ctx) override;
        WhitespaceParser* pws;
        Parser* pvalue;
        Parser* pkey;
        ObjectParser (Isolate* isolate, Parser* pvalue) {
            this->isolate = isolate;
            this->pvalue = pvalue;
            this->pkey = new QuotedStringParser(isolate);
            this->pws = new WhitespaceParser(isolate);
        };
        ~ObjectParser () {
            delete this->pkey;
            delete this->pws;
        };
};

ParseResult ObjectParser::parse(ParserContext* ctx) {
    if ( ! ctx->isValid() ) return ctx->unrecognized();
    if ( ctx->getHead() != '{' ) return ctx->unrecognized();
    ctx = ctx->clone();
    ctx->fwd();

    Local<Object> value = Object::New(this->isolate);

    {
        ParseResult result = this->pws->parse(ctx);
        ctx = result.ctx;
    }

    bool firstValue = true;

    for ( ;; ) {
        cout << "ObjectParser\n";
        if ( ! ctx->isValid() ) {
            return ctx->invalid("unexpected end of string in object");
        }

        if ( ctx->getHead() == '}' ) {
            ctx->fwd();
            return ctx->result(value);
        }

        if ( firstValue ) {
            firstValue = false;
        } else {
            if ( ctx->getHead() != ',' ) {
                return ctx->invalid("missing comma in object");
            }
            ctx->fwd();
            {
                ParseResult result = this->pws->parse(ctx);
                ctx = result.ctx;
            }
        }

        Local<Value> key;
        {
            ParseResult result = this->pkey->parse(ctx);
            if ( result.status == INVALID ) return result;
            if ( result.status == UNRECOGNIZED ) {
                return ctx->invalid("key must be a string");
            }
            key = result.value;
            ctx = result.ctx;
        }
        {
            ParseResult result = this->pws->parse(ctx);
            ctx = result.ctx;
        }

        if ( ctx->getHead() != ':' ) {
            return ctx->invalid("expected colon in object");
        }
        ctx->fwd();

        Local<Value> val;
        {
            ParseResult result = this->pvalue->parse(ctx);
            if ( result.status == INVALID ) return result;
            if ( result.status == UNRECOGNIZED ) {
                cout << "a:" + std::to_string(ctx->pos) + ";\n";
                cout << "a:" + std::to_string(ctx->pos) + ";\n";
                return ctx->invalid("unrecognized value in object");
            }
            val = result.value;
            ctx = result.ctx;
        }

        value->Set(
            this->isolate->GetCurrentContext(),
            key, val
        );
    }
}

class KeywordParser: public Parser {
    public:
        ParseResult parse(ParserContext* ctx) override;
        KeywordParser (Isolate* isolate) {
            this->isolate = isolate;
        }
};

ParseResult KeywordParser::parse(ParserContext* ctx) {
    if ( ! ctx->isValid() ) return ctx->unrecognized();
    if ( ctx->atLiteral("true") ) {
        ctx = ctx->clone();
        ctx->fwd(4);
        return ctx->result(Boolean::New(this->isolate, true));
    }
    if ( ctx->atLiteral("false") ) {
        ctx = ctx->clone();
        ctx->fwd(5);
        return ctx->result(Boolean::New(this->isolate, false));
    }
    if ( ctx->atLiteral("null") ) {
        ctx = ctx->clone();
        ctx->fwd(4);
        return ctx->result(Null(this->isolate));
    }
    return ctx->unrecognized();
}

class ValueParser: public Parser {
    public:
        ParseResult parse(ParserContext* ctx) override;
        Parser** delegates;
        WhitespaceParser* pws;
        ValueParser (Isolate* isolate) {
            this->isolate = isolate;
            this->pws = new WhitespaceParser(isolate);
            this->delegates = new Parser*[5];
            this->delegates[0] = new QuotedStringParser(isolate);
            this->delegates[1] = new NumberParser(isolate);
            this->delegates[2] = new KeywordParser(isolate);
            this->delegates[3] = new ArrayParser(isolate, this);
            this->delegates[4] = new ObjectParser(isolate, this);
        };
        ~ValueParser () {
            delete this->pws;
            for ( int i = 0 ; i < 5 ; i++ ) {
                delete this->delegates[i];
            }
            this->delegates[2] = NULL;
            delete this->delegates;
        }
};

ParseResult ValueParser::parse(ParserContext* ctx) {
    ctx = ctx->clone();
    bool valueSet = false;
    Local<Value> value;

    {
        ParseResult result = pws->parse(ctx);
        ctx = result.ctx;
    }

    for ( int i = 0 ; i < 5 ; i++ ) {
        Parser* delegate = this->delegates[i];
        ParseResult result = delegate->parse(ctx);
        if ( result.status == UNRECOGNIZED ) {
            continue;
        }
        if ( result.status == INVALID ) {
            return result;
        }
        valueSet = true;
        value = result.value;
        ctx = result.ctx;
        break;
    }

    if ( ! valueSet ) return ctx->unrecognized();

    {
        ParseResult result = pws->parse(ctx);
        ctx = result.ctx;
    }

    return ctx->result(value);
}

const int LEX_JSON_OBJECT = 0;
const int LEX_JSON_ARRAY = 1;
const int LEX_JSON_STRING = 2;

bool is_whitespace(char c) {
  return c == '\t' || c == '\n' || c == '\r' || c == ' ';
}

bool is_json_start(char c) {
  return c == '{' || c == '[' || c == '"';
}

void set_json_state(int* jsonState, char c) {
  if ( c == '{' ) {
    *jsonState = LEX_JSON_OBJECT;
    return;
  }
  if ( c == '[' ) {
    *jsonState = LEX_JSON_ARRAY;
  }
  if ( c == '"' ) {
    *jsonState = LEX_JSON_STRING;
  }
}

void ParseValueMethod(const FunctionCallbackInfo<Value>& args) {
    cout << "a\n";
  Isolate* isolate = args.GetIsolate();

  if ( args.Length() != 1 ) {
    isolate->ThrowException(
      Exception::TypeError(
        String::NewFromUtf8(isolate, "Wrong number of arguments")
          .ToLocalChecked()
      )
    );
    return;
  }
  if ( ! args[0]->IsString() ) {
    isolate->ThrowException(
      Exception::TypeError(
        String::NewFromUtf8(isolate, "Argument must be a string")
          .ToLocalChecked()
      )
    );
    return;
  }

  v8::String::Utf8Value strAsUtf8(isolate, args[0]);
  std::string str(*strAsUtf8);

  ParserContext* ctx = new ParserContext(str);

  Parser* parser = new ValueParser(isolate);

    cout << "b\n";
  ParseResult result = parser->parse(ctx);
//   delete parser;
//   delete ctx;
    cout << "c\n";

  if ( result.status == UNRECOGNIZED ) {
    isolate->ThrowException(
      Exception::TypeError(
        String::NewFromUtf8(isolate, "could not parse as value")
          .ToLocalChecked()
      )
    );
  }
  if ( result.status == INVALID ) {
    isolate->ThrowException(
      Exception::TypeError(
        String::NewFromUtf8(isolate, ("invalid: " + result.message).c_str())
          .ToLocalChecked()
      )
    );
  }

    cout << "d\n";

  Local<Object> infoObject = Object::New(isolate);

  infoObject->Set(
      isolate->GetCurrentContext(),
      String::NewFromUtf8(isolate, "length").ToLocalChecked(),
      Number::New(isolate, result.ctx->pos)
  );
    cout << "d.5\n";

  infoObject->Set(
      isolate->GetCurrentContext(),
      String::NewFromUtf8(isolate, "data").ToLocalChecked(),
      result.value
  );

    cout << "e\n";

  args.GetReturnValue().Set(
    infoObject
    // String::NewFromUtf8(isolate, "test").ToLocalChecked()
  );

}

void Initialize(Local<Object> exports) {
  NODE_SET_METHOD(exports, "parse", ParseValueMethod);
}

NODE_MODULE(NODE_GYP_MODULE_NAME, Initialize)

}  // namespace demo
