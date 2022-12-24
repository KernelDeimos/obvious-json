const addon = require('../node_addon/build/Release/addon');

const SegfaultHandler = require('segfault-handler');
SegfaultHandler.registerHandler('crash.log');

{
    const result = addon.parse('1.01e-1');
    console.log('result?', result);
}
{
    const result = addon.parse('{"x": ["a", 1.01e-1]}');
    console.log('result?', result);
}