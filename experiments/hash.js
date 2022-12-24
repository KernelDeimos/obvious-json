const str = '"bfnrt\\/';

for ( let i = 0 ; i < 100 ; i++ ) {
    console.log(i)
    for ( const l of str ) {
        let n = l.charCodeAt(0);
        let s = l.charCodeAt(0).toString(2)
        if ( s.length < 7 ) s = '0' + s;
        console.log(s, n, (n - 34) % i);
    }
}

// Tried this to make it faster, but it didn't work

// const escapes = Array(117);
// const addEscape = (ch, val) => {
//     escapes[ch.charCodeAt(0)] = val;
// }

// addEscape('"', '"');
// addEscape('b', '\b');
// addEscape('f', '\f');
// addEscape('n', '\n');
// addEscape('r', '\r');
// addEscape('t', '\t');
// addEscape('\\', '\\');
// addEscape('/', '/');