const assert=require('assert');const {fallback,addItem,summary,checkTops,runTool,inferPending,weak}=require('./api/chat.js')._t;
function conv(msgs){let c=[],p=null,last;for(const m of msgs){last=fallback(m,c,p);p=last.pending;assert.ok(last.reply&&last.reply.length>10,'real sentence for '+m)}return {c,p,last,s:summary(c)}}
let r=conv(['a chicago dog','relish, pickle and cheese','2 new york dogs','mustard and chili','done']);assert.equal(r.s.lines.length,2);assert.equal(r.s.total,8+14);
r=conv(['chicago dog with relish']);assert.deepEqual(r.c[0].toppings,['relish']);
r=conv(['chicago dog','mustard, sport peppers, celery salt, tomato, pickle, onions','done']);
assert.deepEqual(r.c[0].toppings.sort(),['celery_salt','pickle','raw_onion','sport_peppers','tomatoes']);assert.equal(r.s.total,6);assert.ok(r.last.showSummary);
r=conv(['chicago dog','mustard, sport peppers, onions']);assert.match(r.last.reply,/Mustard isn't listed for the Chicago/);
r=conv(['chicago dog with relish','add tomato and celery salt']);assert.deepEqual(r.c[0].toppings,['relish','tomatoes','celery_salt']);
r=conv(['2 ny dogs','fries','done']);assert.equal(r.s.lines.length,2);assert.equal(r.s.total,16);
r=conv(['2 ny dogs','mustard','fries','done']);assert.equal(r.s.total,16);assert.deepEqual(r.c[0].toppings,['mustard']);
r=conv(['chicago dog','ny dog','ketchup','done']);assert.equal(r.s.lines.length,2);
r=conv(['chicago dog','done']);assert.equal(r.s.total,6);
let c=[];let n=[];let o=runTool('add_item',{item_id:'chicago_dog',toppings:['Mustard','sport peppers','onions','tomato']},c,n);
assert.ok(o.ok);assert.deepEqual(o.not_listed,['mustard']);assert.deepEqual(c[0].toppings,['sport_peppers','raw_onion','tomatoes']);
o=runTool('update_toppings',{add:['celery salt','ketchup']},c,n);assert.deepEqual(o.not_listed,['ketchup']);assert.ok(c[0].toppings.includes('celery_salt'));
assert.deepEqual(checkTops('ny_dog',['onions','chili']).ok,['red_onions','chili']);
assert.ok(weak('OK.'));assert.ok(weak(''));assert.ok(!weak('Added your Chicago dog. Anything else?'));
assert.equal(inferPending('a chicago dog','Which toppings would you like?',[],null,false).item_id,'chicago_dog');
assert.equal(addItem([], 'lobster').ok,false);assert.equal(addItem([], 'ny_dog',['pickle']).ok,false);
assert.equal(summary((x=>{addItem(x,'italian_beef');return x})([])).incomplete,true);
const h=require('./api/chat.js');const g=h._t.menuGroups();assert.equal(g.reduce((s,c)=>s+c.items.length,0),26);assert.deepEqual(g.map(c=>c.cat),['Hot Dogs','Combos','Extras','Drinks']);
let got;h({method:'POST',headers:{},body:{message:'menu'}},{setHeader(){},status(){return this},json(j){got=j}}).then(()=>{assert.equal(got.mode,'menu');assert.equal(got.menuCard.length,4);
assert.ok(h._t.fallback('1 Chicago Vienna Beef Hot Dog',[],null).pending.item_id==='chicago_dog');
for(const i of g.flatMap(c=>c.items)){const c=[];const o=h._t.fallback('1 '+i.name,c,null);assert.equal((c[0]||o.pending||{}).item_id,i.id,'menu tap works: '+i.name)}
console.log('all tests passed')});
