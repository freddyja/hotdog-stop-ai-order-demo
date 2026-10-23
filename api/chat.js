// Demo only: no payments, no order is ever sent anywhere.
const MENU = require('../menu.json');
const ALLOWED = ['https://computingmadeeasy.org','https://www.computingmadeeasy.org'];
const byId = Object.fromEntries(MENU.items.map(i => [i.id, i]));
const tops = t => MENU.toppings[t || 'none'] || [];

// Map free-text topping words (names, synonyms, plurals) to topping ids for a given item.
const SYN = [
  [/sport ?peppers?/, 'sport_peppers'], [/celery( salt)?/, 'celery_salt'], [/tomato(es)?/, 'tomatoes'], [/pickles?( spear)?/, 'pickle'],
  [/relish/, 'relish'], [/(peppers? (and|&) (sauteed |sautéed )?onions?|sauteed onions?|sautéed onions?|grilled onions?)/, 'peppers_onions'],
  [/(cooked|red) onions?/, 'red_onions'], [/raw onions?/, 'raw_onion'], [/mustard/, 'mustard'], [/ketchup|catsup/, 'ketchup'],
  [/chil(i|li|e)/, 'chili'], [/cheese/, 'cheese']
];
function normTop(word, itemId) {
  const it = byId[itemId]; const allowed = tops(it && it.toppings); let w = String(word || '').toLowerCase().trim();
  const direct = allowed.find(a => a[0] === w || a[1].toLowerCase() === w); if (direct) return direct[0];
  for (const [re, id] of SYN) if (re.test(w)) return id;
  if (/onions?/.test(w)) return allowed.find(a => a[0] === 'raw_onion') ? 'raw_onion' : 'red_onions';
  return w.replace(/\s+/g, '_');
}
function splitTops(text) { return String(text || '').toLowerCase().replace(/peppers? (and|&) (sauteed |sautéed )?onions?/g, 'peppers_onions').split(/,|\band\b|&|\bwith\b|\bplus\b|\//).map(x => x.replace(/peppers_onions/, 'peppers & onions').replace(/\b(add|some|extra|please|also|i want|i'd like|and|just)\b/g, '').trim()).filter(Boolean); }
// split toppings into valid ids and not-listed words for an item
function checkTops(itemId, list) {
  const allowed = tops(byId[itemId] && byId[itemId].toppings); const ok = [], bad = [];
  for (const raw of list || []) { const id = normTop(raw, itemId); if (allowed.find(a => a[0] === id)) ok.push(id); else bad.push(String(raw).toLowerCase().trim().replace(/_/g, ' ')); }
  return { ok: [...new Set(ok)], bad: [...new Set(bad)] };
}
const topName = (itemId, id) => (tops(byId[itemId].toppings).find(a => a[0] === id) || [, id])[1];
const optList = itemId => tops(byId[itemId].toppings).map(a => a[1] + (a[2] ? ` (+$${a[2]})` : '')).join(', ');
function notListedMsg(itemId, bad) { return bad.length ? ` ${cap(bad.join(', '))} ${bad.length > 1 ? "aren't" : "isn't"} listed for the ${byId[itemId].name}; available toppings are: ${optList(itemId)}.` : ''; }
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function cors(req, res) {
  const o = req.headers.origin || '';
  if (ALLOWED.includes(o) || /^https:\/\/hotdog-stop-ai-order-demo[\w-]*\.vercel\.app$/.test(o) || /^http:\/\/localhost/.test(o)) {
    res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

// ---- cart ops, validated against menu ----
function addItem(cart, item_id, toppings = [], qty = 1, drink) {
  const it = byId[item_id];
  if (!it) return { ok: false, error: `"${item_id}" is not on the menu` };
  const allowed = tops(it.toppings);
  const bad = toppings.filter(t => !allowed.find(a => a[0] === t));
  if (bad.length) return { ok: false, error: `Topping(s) not offered on ${it.name}: ${bad.join(', ')}` };
  if (drink && (!it.drink || !MENU.drinks.includes(drink))) return { ok: false, error: `Invalid drink choice` };
  qty = Math.max(1, Math.min(10, parseInt(qty) || 1));
  cart.push({ item_id, toppings: [...new Set(toppings)], qty, drink: drink || null });
  return { ok: true };
}
function lineInfo(l) {
  const it = byId[l.item_id];
  const tp = l.toppings.map(t => tops(it.toppings).find(a => a[0] === t));
  const extra = tp.reduce((s, a) => s + a[2], 0);
  const unit = it.price == null ? null : it.price + extra;
  return { name: it.name, qty: l.qty, toppings: tp.map(a => a[1] + (a[2] ? ` (+$${a[2].toFixed(2)})` : '')),
    drink: l.drink ? byId[l.drink].name : null, unit, total: unit == null ? null : unit * l.qty,
    note: it.price == null ? 'price not listed' : (l.drink ? 'drink choice assumed (site just says "drink")' : null) };
}
function summary(cart) {
  const lines = cart.map(lineInfo);
  const total = lines.reduce((s, l) => s + (l.total || 0), 0);
  return { lines, total: Math.round(total * 100) / 100, incomplete: lines.some(l => l.total == null) };
}
function sanitizeCart(c) {
  const out = [];
  for (const l of Array.isArray(c) ? c.slice(0, 30) : []) if (l && byId[l.item_id]) addItem(out, l.item_id, Array.isArray(l.toppings) ? l.toppings : [], l.qty, l.drink);
  return out;
}

// ---- deterministic fallback ----
const ALIASES = [
  [/chicago special 2|2 chicago special|two chicago special/, 'combo_chi2'], [/chicago special|chicago combo/, 'combo_chi'],
  [/new york special 2|ny special 2|2 (ny|new york) special/, 'combo_ny2'], [/(new york|ny) (special|combo)/, 'combo_ny'],
  [/kielbasa (special )?2\b|2 kielbasa special/, 'combo_kiel2'], [/kielbasa (special|combo)/, 'combo_kiel'],
  [/nathan( jumbo)? 2/, 'combo_nathan2'], [/nathan( jumbo)? (combo|special)/, 'combo_nathan'],
  [/italian beef sandwich \(single\)|single (italian )?beef/, 'italian_beef'], [/italian beef|beef sandwich/, 'combo_beef'], [/sausage (sandwich|combo)/, 'combo_sausage'],
  [/chicago/, 'chicago_dog'], [/(new york|ny|sabrett)/, 'ny_dog'], [/kielbasa|polish/, 'kielbasa'], [/nathan|jumbo dog/, 'nathan'],
  [/italian sausage|sausage/, 'italian_sausage'], [/corn ?dog/, 'corn_dog'], [/hot ?dog|frank|wiener/, 'ny_dog'],
  [/knish/, 'knish'], [/pizza/, 'pizza_puff'], [/tots/, 'tots'], [/fries/, 'fries'], [/pretzel/, 'pretzel'], [/curd/, 'curds'],
  [/tamale/, 'tamale'], [/yoo ?hoo/, 'yoohoo'], [/water/, 'water']
];
const ELSE = ['Want fries with that?', 'Something to drink? We have water or YooHoo.', 'What else can I get you? Maybe a New York dog?', 'Anything else for you?', 'How about a knish or some cheese curds?', 'Anything else, or are you all set?', 'Can I get you a drink with that, water or YooHoo?']
const anyElse = (ctx = '') => { const l = ELSE.filter(e => !(/fries/i.test(ctx) && /fries/i.test(e))); return l[Math.floor(Math.random() * l.length)]; };
const NUM = { one:1, a:1, an:1, two:2, three:3, four:4, five:5 };
const DONE_RE = /\b(done|that'?s (all|it)|checkout|check out|summary|my (cart|order|total)|finish|nothing else|no(pe)?,? (thanks|that'?s)|i'?m good)\b/;
const TOPWORD_RE = /(mustard|ketchup|catsup|chil(i|li|e)|cheese|relish|pickle|sport ?pepper|tomato|celery|onion)/;
function lineText(l) { const it = byId[l.item_id]; return `${l.qty} × ${it.name}${l.toppings.length ? ' with ' + l.toppings.map(t => topName(l.item_id, t)).join(', ') : ''}`; }
function itemHit(m) { const h = ALIASES.find(([re]) => re.test(m.replace(/(sport )?peppers?|onions?|cheese|chil(i|li)|pickles?|tomato(es)?|celery salt|relish|mustard|ketchup/g, ' '))); return h && byId[h[1]]; }
function fallback(msg, cart, pending) {
  const m = msg.toLowerCase().trim();
  const pendTail = () => pending ? ` I still need toppings for your ${byId[pending.item_id].name}: ${optList(pending.item_id)} (or "plain").` : '';
  if (/^(menu|what do you have|options|help)/.test(m)) return { reply: menuText() + pendTail(), pending };
  if (/(remove|delete|cancel|take off)/.test(m)) {
    const n = parseInt((m.match(/\d+/) || [])[0]); const i = n ? n - 1 : cart.length - 1;
    if (cart[i]) { const nm = byId[cart[i].item_id].name; cart.splice(i, 1); return { reply: `Removed ${nm}. ${anyElse()}`, pending }; }
    return { reply: 'There is nothing to remove yet. What can I get you?', pending };
  }
  if (DONE_RE.test(m)) {
    let extra = '';
    if (pending) { addItem(cart, pending.item_id, [], pending.qty, pending.drink); extra = ` I added your ${byId[pending.item_id].name} plain since no toppings were picked.`; }
    return { reply: `Here is your order summary (demo, not a real order).${extra}`, pending: null, showSummary: true };
  }
  const it = itemHit(m);
  const words = TOPWORD_RE.test(m) || /(plain|no toppings|none|nothing on it)/.test(m);
  // topping reply for the pending item
  if (pending && !it && words) {
    const { ok, bad } = /(plain|no toppings|none|nothing on it)/.test(m) ? { ok: [], bad: [] } : checkTops(pending.item_id, splitTops(m));
    addItem(cart, pending.item_id, ok, pending.qty, pending.drink);
    return { reply: `Added ${lineText(cart[cart.length - 1])}.${notListedMsg(pending.item_id, bad)} ${anyElse()}`, pending: null };
  }
  // topping change for the last item already in the cart (e.g. "add mustard")
  if (!pending && !it && words && cart.length) {
    const l = cart[cart.length - 1]; const { ok, bad } = checkTops(l.item_id, splitTops(m));
    l.toppings = [...new Set([...l.toppings, ...ok])];
    return { reply: `${ok.length ? 'Updated' : 'Your item is still'}: ${lineText(l)}.${notListedMsg(l.item_id, bad)} ${anyElse()}`, pending: null };
  }
  if (!it) return { reply: `Sorry, I can only take items from The Hot Dog Stop's menu. Try "Chicago dog", "New York Special", "fries", or say "menu".${pendTail()}`, pending };
  const q = parseInt((m.match(/\b(\d+)\b/) || [])[1]) || NUM[(m.match(/\b(one|a|an|two|three|four|five)\b/) || [])[1]] || 1;
  const drink = it.drink ? (/yoo ?hoo/.test(m) ? 'yoohoo' : 'water') : undefined;
  const allowed = tops(it.toppings);
  const rest = m.replace(/^.*?\b(with|w\/)\b/, '');
  const { ok: pre, bad } = /\b(with|w\/)\b/.test(m) ? checkTops(it.id, splitTops(rest)) : { ok: [], bad: [] };
  if (!allowed.length || pre.length || /plain/.test(m)) {
    const r = addItem(cart, it.id, pre, q, drink);
    return { reply: r.ok ? `Added ${lineText(cart[cart.length - 1])}${it.price == null ? ' (price not listed on the menu)' : ''}.${notListedMsg(it.id, bad)} ${pending ? '' : anyElse(it.name)}${pendTail()}` : r.error, pending };
  }
  // new item while another one is still waiting for toppings: keep the waiting one, add it plain
  let kept = '';
  if (pending) { addItem(cart, pending.item_id, [], pending.qty, pending.drink); kept = `I added your ${byId[pending.item_id].name} plain (say "add relish" etc. to change it). `; }
  return { reply: `${kept}${q} × ${it.name}${it.price != null ? ` ($${it.price.toFixed(2)} each)` : ' (price not listed)'}. What toppings would you like? ${optList(it.id)}. Or say "plain".${notListedMsg(it.id, bad)}`, pending: { item_id: it.id, qty: q, drink }, chips: allowed.map(a => a[1]).concat(['Plain']) };
}
function menuGroups() { const cats = []; for (const i of MENU.items) { let c = cats.find(x => x.cat === i.cat); if (!c) cats.push(c = { cat: i.cat, items: [] }); c.items.push({ id: i.id, name: i.name, price: i.price, desc: i.desc || null }); } return cats; }
function menuText() {
  const cats = {}; MENU.items.forEach(i => (cats[i.cat] = cats[i.cat] || []).push(`${i.name} ${i.price == null ? '(price not listed)' : '$' + i.price.toFixed(2)}`));
  return Object.entries(cats).map(([c, l]) => `${c}: ${l.join('; ')}`).join('\n');
}

// ---- AI mode via Vercel AI Gateway (OpenAI-compatible) ----
const MODEL = process.env.AI_MODEL || 'google/gemini-2.5-flash-lite';
// OIDC: Vercel injects a per-request token in the x-vercel-oidc-token header (no key needed).
function gwKey(req) { return process.env.AI_GATEWAY_API_KEY || (req && req.headers && req.headers['x-vercel-oidc-token']) || process.env.VERCEL_OIDC_TOKEN || null; }
const TOOLS = [
  { type: 'function', function: { name: 'add_item', description: 'Add a menu item to the cart with its toppings. Topping names or ids from that item\'s list; unknown ones are reported back as not_listed.', parameters: { type: 'object', properties: {
    item_id: { type: 'string', enum: MENU.items.map(i => i.id) }, toppings: { type: 'array', items: { type: 'string' } },
    qty: { type: 'integer' }, drink: { type: 'string', enum: MENU.drinks } }, required: ['item_id'] } } },
  { type: 'function', function: { name: 'update_toppings', description: 'Add or remove toppings on an existing cart line (1-based index; omit index for the last line)', parameters: { type: 'object', properties: {
    index: { type: 'integer' }, add: { type: 'array', items: { type: 'string' } }, remove: { type: 'array', items: { type: 'string' } } } } } },
  { type: 'function', function: { name: 'remove_item', description: 'Remove a cart line by 1-based index', parameters: { type: 'object', properties: { index: { type: 'integer' } }, required: ['index'] } } },
  { type: 'function', function: { name: 'show_cart', description: 'Show the final order summary. Call when the customer says done / that\'s all / checkout.', parameters: { type: 'object', properties: {} } } }
];
function sysPrompt(cart, pending) {
  return `You are a friendly order-taker for The Hot Dog Stop food truck (DEMO ONLY, not a real order, no payments). ONLY offer items in this menu JSON; never invent items, toppings or prices. If an item's price is null say "price not listed".
FLOW: 1) When a customer picks a hot dog or combo without toppings, do NOT add it yet: list that item's toppings (extra-cost ones marked) and ask which they want. 2) When they reply with toppings (e.g. "mustard, sport peppers, onions"), IMMEDIATELY call add_item for the item you asked about with those toppings (pass their words; e.g. onions = raw onion on Chicago dogs, tomato = tomatoes). If they ordered the item with toppings up front, add it right away. 3) If the tool reports not_listed toppings, politely say those aren't listed for that item and name the valid options (do not invent them, do not change prices). 4) After every add, warmly confirm the item and toppings, then ask if they want anything else — vary your wording every time (e.g. "Anything else I can get you?", "Want to add fries or a drink?", "Another dog, or are you all set?"), never repeat the same phrase twice in a row. Keep taking items and re-asking until they say they're done. Sound like a friendly person at the truck window, natural and conversational. 5) To change toppings on an item already in the cart, call update_toppings. 5b) If an item is WAITING FOR TOPPINGS and they order something else, add the new item and remind them you still need toppings for the waiting one. 6) For combos ask drink (water or yoohoo). 7) When they say done / that's all / no thanks / I'm good, call show_cart and read back a short summary with the total (e.g. "That's one Chicago dog and fries, 12 dollars total.").
TONE: sound like a friendly real cashier at the truck window: short, casual, warm, ONE question at a time. Upsell naturally with menu items only: after a hot dog, offer fries ("Want fries with that?") or a drink ("Something to drink? Water or YooHoo?"); if they get a dog plus fries and a drink, mention the matching Special combo is cheaper (e.g. Chicago dog $6 + fries $6 + drink $2 = $14 vs Chicago Special $10) and swap it if they agree (remove the separate lines, add the combo with their toppings and drink). For combos, ask which drink: water or YooHoo. Then ask "What else can I get you? Maybe a New York dog?" style questions. Don't push more than once per item; if they say no, move on.
ALWAYS answer with at least one full sentence; never reply with just "OK". Keep replies short (1-3 sentences), mobile friendly.
MENU: ${JSON.stringify(MENU.items.map(({ id, name, price, toppings, drink }) => ({ id, name, price, toppings, drink })))}
TOPPING SETS [id,name,extra$]: ${JSON.stringify(MENU.toppings)}
${pending ? `WAITING FOR TOPPINGS ON: ${JSON.stringify(pending)}\n` : ''}CURRENT CART: ${JSON.stringify(summary(cart))}`;
}
function runTool(name, a, cart, notes) {
  if (name === 'add_item') {
    if (!byId[a.item_id]) return { ok: false, error: `"${a.item_id}" is not on the menu` };
    const { ok, bad } = checkTops(a.item_id, a.toppings || []);
    const r = addItem(cart, a.item_id, ok, a.qty, a.drink && byId[a.item_id].drink ? a.drink : (byId[a.item_id].drink ? 'water' : undefined));
    if (!r.ok) return r;
    notes.push(`Added ${lineText(cart[cart.length - 1])}.` + notListedMsg(a.item_id, bad));
    return { ok: true, added: lineInfo(cart[cart.length - 1]), not_listed: bad, valid_toppings: optList(a.item_id) };
  }
  if (name === 'update_toppings') {
    const i = a.index ? a.index - 1 : cart.length - 1; const l = cart[i]; if (!l) return { ok: false, error: 'no such line' };
    const add = checkTops(l.item_id, a.add || []), rem = checkTops(l.item_id, a.remove || []);
    l.toppings = [...new Set([...l.toppings, ...add.ok])].filter(t => !rem.ok.includes(t));
    notes.push(`Updated: ${lineText(l)}.` + notListedMsg(l.item_id, add.bad));
    return { ok: true, line: lineInfo(l), not_listed: add.bad, valid_toppings: optList(l.item_id) };
  }
  if (name === 'remove_item') { if (!cart[a.index - 1]) return { ok: false, error: 'no such line' }; notes.push(`Removed ${byId[cart[a.index - 1].item_id].name}.`); cart.splice(a.index - 1, 1); return { ok: true }; }
  return summary(cart);
}
const weak = t => !t || t.trim().length < 12 || /^(ok|okay|sure|done|got it)[.!]?$/i.test(t.trim());
async function ai(history, cart, key, pending) {
  if (!key) key = gwKey(); if (!key) throw new Error('no key');
  const msgs = [{ role: 'system', content: sysPrompt(cart, pending) }, ...history.slice(-14)];
  let showSummary = false; const notes = []; let addedAny = false; let retried = false;
  const toppingOnly = !itemHit(String(history[history.length - 1].content).toLowerCase()) && !pending;
  for (let step = 0; step < 5; step++) {
    const r = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', { method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages: msgs, tools: TOOLS, temperature: 0.2, max_tokens: 400 }),
      signal: AbortSignal.timeout(15000) });
    if (r.status === 429 && !retried) { retried = true; step--; await new Promise(z => setTimeout(z, 1500)); continue; }
    if (!r.ok) throw new Error('gateway ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const msg = (await r.json()).choices[0].message;
    if (!msg.tool_calls || !msg.tool_calls.length) return { reply: msg.content, showSummary, notes, addedAny };
    msgs.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls });
    for (const tc of msg.tool_calls) {
      let a = {}; try { a = JSON.parse(tc.function.arguments || '{}'); } catch {}
      if (tc.function.name === 'show_cart') showSummary = true;
      if (tc.function.name === 'add_item' && (!pending || a.item_id === pending.item_id)) addedAny = true;
      let name = tc.function.name;
      // "chicago dog with relish" then "mustard, pickle..." -> update that dog instead of adding a second one
      const last = cart[cart.length - 1];
      if (name === 'add_item' && toppingOnly && last && last.item_id === a.item_id && (parseInt(a.qty) || 1) === last.qty) { name = 'update_toppings'; a = { add: a.toppings || [] }; }
      const out = runTool(name, a, cart, notes);
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ ...out, cart: summary(cart) }) });
    }
  }
  return { reply: '', showSummary, notes, addedAny };
}
// The model can't see the client's pending state reliably; detect "asked for toppings" from its reply.
function inferPending(message, reply, cart, prevPending, addedAny) {
  if (addedAny) return null;
  if (/topping/i.test(reply || '')) { const it = itemHit(message.toLowerCase()); if (it && tops(it.toppings).length) {
    const m = message.toLowerCase(); const q = parseInt((m.match(/\b(\d+)\b/) || [])[1]) || NUM[(m.match(/\b(one|a|an|two|three|four|five)\b/) || [])[1]] || 1;
    return { item_id: it.id, qty: q, drink: it.drink ? 'water' : undefined }; } }
  return prevPending;
}
module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') return res.status(200).json({ menu: MENU, aiConfigured: !!gwKey(req), auth: process.env.AI_GATEWAY_API_KEY ? 'key' : (gwKey(req) ? 'oidc' : 'none'), model: MODEL });
  let b = req.body; if (typeof b === 'string') try { b = JSON.parse(b); } catch { b = {}; }
  b = b || {};
  const message = String(b.message || '').slice(0, 500);
  const cart = sanitizeCart(b.cart);
  const history = (Array.isArray(b.history) ? b.history : []).filter(h => h && ['user', 'assistant'].includes(h.role)).map(h => ({ role: h.role, content: String(h.content).slice(0, 500) }));
  const pending = b.pending && byId[b.pending.item_id] ? { item_id: b.pending.item_id, qty: Math.max(1, Math.min(10, parseInt(b.pending.qty) || 1)), drink: MENU.drinks.includes(b.pending.drink) ? b.pending.drink : undefined } : null;
  let out, mode = 'ai', note;
  if (/^\s*(show (me )?(the )?)?(full )?menu\??\s*$|^\s*what do you (have|sell)/i.test(message)) {
    return res.status(200).json({ reply: 'Here is our full menu. Tap any item to start your order.' + (pending ? ` (Your ${byId[pending.item_id].name} is still waiting for toppings.)` : ''), cart, summary: summary(cart), pending,
      chips: null, showSummary: false, mode: 'menu', menuCard: menuGroups(), model: null, note: null, demo: true });
  }
  if (b.mode !== 'fallback') {
    const before = JSON.stringify(cart);
    try {
      out = await ai([...history, { role: 'user', content: message }], cart, gwKey(req), pending);
      out.pending = inferPending(message, out.reply, cart, pending, out.addedAny);
      if (DONE_RE.test(message.toLowerCase()) && !out.showSummary) out.showSummary = true;
      if (out.showSummary && out.pending) { addItem(cart, out.pending.item_id, [], out.pending.qty, out.pending.drink); out.pending = null; }
      if (weak(out.reply)) {
        const s = summary(cart);
        out.reply = out.showSummary ? `${out.notes.join(' ')} Here is your order summary: total $${s.total.toFixed(2)} (demo, not a real order).`.trim()
          : out.notes.length ? `${out.notes.join(' ')} ${anyElse(out.notes.join(' '))}`
          : `Sorry, I didn't catch that. What would you like from The Hot Dog Stop menu? Say "menu" to see everything.`;
      } else if (out.notes.some(n => /listed for/.test(n)) && !/listed/i.test(out.reply)) out.reply += ' ' + out.notes.filter(n => /listed for/.test(n)).map(n => n.replace(/^.*?\.\s/, '')).join(' ');
    }
    catch (e) { note = String(e.message).slice(0, 120); cart.splice(0, cart.length, ...JSON.parse(before)); }
  }
  if (!out) { mode = 'fallback'; out = fallback(message, cart, pending); }
  if (out.showSummary && cart.length) { const s = summary(cart); out.reply = `You got it! That's ${cart.map(l => lineText(l)).join(', ')}, $${s.total.toFixed(2)} total. Here's your order summary (demo, not a real order).`; }
  res.status(200).json({ reply: out.reply, cart, summary: summary(cart), pending: out.pending || null, chips: out.chips || null,
    showSummary: !!out.showSummary, mode, model: mode === 'ai' ? MODEL : null, note: mode === 'fallback' ? note || null : null, demo: true });
};
module.exports._t = { menuGroups, fallback, addItem, summary, checkTops, runTool, inferPending, weak };
