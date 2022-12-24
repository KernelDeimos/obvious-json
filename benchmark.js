const obvious = require('./entry');
const NUMBER_OF_OBJECTS = Math.pow(10,5);
const PROTO = {};

for ( const letter of ['A','B','C','D','E','F','G'] ) {
    PROTO[letter] = '12345.6789e-12';
}
for ( const letter of ['H','I','J','K','L','M','N'] ) {
    PROTO[letter] = '"this is \\"a string\\" \\u00e9\\u00e9"';
}
for ( const letter of ['P','Q','R','S','T','U','V'] ) {
    PROTO[letter] = 'true';
}

let stringToParse = '';

stringToParse += '[';
for ( let i = 0 ; i < NUMBER_OF_OBJECTS ; i++ ) {
    stringToParse += '{';
    for ( const letter in PROTO ) {
        stringToParse += `"${letter}": ${PROTO[letter]},`;
    }
    stringToParse += '"Z": ""'; // for no trailing comma
    stringToParse += '},';
}
stringToParse += '{}'; // for no trailing comma
stringToParse += ']';

const t0 = performance.now();
JSON.parse(stringToParse);
const t1 = performance.now();
obvious.parse(stringToParse);
const t2 = performance.now();

console.log(`native  parser: ${t1 - t0}ms`);
console.log(`obvious parser: ${t2 - t1}ms`);

const asPercent = Math.round((t2-t1)/(t1-t0)*100*Math.pow(10,3))/Math.pow(10,3);

console.log(`difference: ${asPercent}%`)

if ( asPercent < 400 ) {
    console.log('Wow, it\'s a lot faster. Please submit a PR!');
}
