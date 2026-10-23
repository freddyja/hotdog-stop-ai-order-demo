const assert=require('assert');const {fallback,addItem,summary}=require('./api/chat.js')._t;
let c=[],p=null;for(const m of ['a chicago dog','relish, pickle and cheese','2 new york dogs','mustard and chili','done']){const o=fallback(m,c,p);p=o.pending}
const s=summary(c);assert.equal(s.lines.length,2);assert.equal(s.total,8+14);
assert.equal(addItem([], 'lobster').ok,false);assert.equal(addItem([], 'ny_dog',['pickle']).ok,false);
assert.equal(summary((x=>{addItem(x,'italian_beef');return x})([])).incomplete,true);
console.log('all tests passed');
