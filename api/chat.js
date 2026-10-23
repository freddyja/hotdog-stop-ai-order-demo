// Demo only: no payments, no order is ever sent anywhere.
const MENU = require('../menu.json');
const ALLOWED = ['https://computingmadeeasy.org','https://www.computingmadeeasy.org'];
const byId = Object.fromEntries(MENU.items.map(i => [i.id, i]));
const tops = t => MENU.toppings[t || 'none'] || [];

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
  [/kielbasa (special )?2|2 kielbasa special/, 'combo_kiel2'], [/kielbasa (special|combo)/, 'combo_kiel'],
  [/nathan( jumbo)? 2/, 'combo_nathan2'], [/nathan( jumbo)? (combo|special)/, 'combo_nathan'],
  [/beef/, 'combo_beef'], [/sausage (sandwich|combo)/, 'combo_sausage'],
  [/chicago/, 'chicago_dog'], [/(new york|ny|sabrett)/, 'ny_dog'], [/kielbasa|polish/, 'kielbasa'], [/nathan|jumbo dog/, 'nathan'],
  [/italian sausage|sausage/, 'italian_sausage'], [/corn ?dog/, 'corn_dog'], [/hot ?dog|frank|wiener/, 'ny_dog'],
  [/knish/, 'knish'], [/pizza/, 'pizza_puff'], [/tots/, 'tots'], [/fries/, 'fries'], [/pretzel/, 'pretzel'], [/curd/, 'curds'],
  [/tamale/, 'tamale'], [/yoo ?hoo/, 'yoohoo'], [/water/, 'water']
];
const TOP_WORDS = { mustard:'mustard', ketchup:'ketchup', chili:'chili', cheese:'cheese', relish:'relish', pickle:'pickle',
  'sport pepper':'sport_peppers', tomato:'tomatoes', 'celery':'celery_salt', 'sauteed onion':'peppers_onions', 'peppers and onions':'peppers_onions',
  'peppers & onions':'peppers_onions', 'red onion':'red_onions', 'cooked onion':'red_onions', 'raw onion':'raw_onion' };
const NUM = { one:1, a:1, an:1, two:2, three:3, four:4, five:5 };
function fallback(msg, cart, pending) {
  const m = msg.toLowerCase();
  if (/^(menu|what do you have|options|help)/.test(m)) return { reply: menuText(), pending: null };
  if (/(remove|delete|cancel|take off)/.test(m)) {
    const n = parseInt((m.match(/\d+/) || [])[0]); const i = n ? n - 1 : cart.length - 1;
    if (cart[i]) { const nm = byId[cart[i].item_id].name; cart.splice(i, 1); return { reply: `Removed ${nm}.`, pending: null }; }
    return { reply: 'Nothing to remove.', pending: null };
  }
  if (/(done|that'?s all|checkout|summary|cart|finish|nothing else)/.test(m)) return { reply: 'Here is your order summary (demo, not a real order).', pending: null, showSummary: true };
  // toppings for pending item
  const found = Object.entries(TOP_WORDS).filter(([w]) => m.includes(w)).map(([, id]) => id);
  if (m.includes('onion') && !found.some(f => /onion/.test(f))) found.push('red_onions', 'raw_onion');
  if (pending && (found.length || /(plain|no toppings|none|nothing)/.test(m)) && !ALIASES.some(([re]) => re.test(m.replace(/onion|pepper|cheese|chili/g, '')))) {
    const allowed = tops(byId[pending.item_id].toppings).map(a => a[0]);
    const use = [...new Set(found.filter(f => allowed.includes(f)))];
    const r = addItem(cart, pending.item_id, use, pending.qty, pending.drink);
    return { reply: r.ok ? `Added ${pending.qty} × ${byId[pending.item_id].name}${use.length ? ' with ' + use.join(', ').replace(/_/g, ' ') : ' (plain)'}. Anything else? Say "done" for the summary.` : r.error, pending: null };
  }
  const hit = ALIASES.find(([re]) => re.test(m));
  if (!hit) return { reply: "Sorry, I can only take items from The Hot Dog Stop's menu. Try \"Chicago dog\", \"New York Special\", \"fries\", or say \"menu\".", pending };
  const it = byId[hit[1]];
  const q = parseInt((m.match(/\b(\d+)\b/) || [])[1]) || NUM[(m.match(/\b(one|a|an|two|three|four|five)\b/) || [])[1]] || 1;
  const drink = it.drink ? (/yoo ?hoo/.test(m) ? 'yoohoo' : 'water') : undefined;
  const allowed = tops(it.toppings);
  const pre = found.filter(f => allowed.find(a => a[0] === f));
  if (!allowed.length || pre.length || /plain/.test(m)) {
    const r = addItem(cart, it.id, pre, q, drink);
    return { reply: r.ok ? `Added ${q} × ${it.name}${pre.length ? ' with ' + pre.join(', ').replace(/_/g, ' ') : ''}${it.price == null ? ' (price not listed on the menu)' : ''}. Anything else?` : r.error, pending: null };
  }
  return { reply: `${q} × ${it.name}${it.price != null ? ` ($${it.price.toFixed(2)} each)` : ' (price not listed)'}. What toppings? ${allowed.map(a => a[1] + (a[2] ? ` +$${a[2]}` : '')).join(', ')}. Or say "plain".`, pending: { item_id: it.id, qty: q, drink }, chips: allowed.map(a => a[1]).concat(['Plain']) };
}
function menuText() {
  const cats = {}; MENU.items.forEach(i => (cats[i.cat] = cats[i.cat] || []).push(`${i.name} ${i.price == null ? '(price not listed)' : '$' + i.price.toFixed(2)}`));
  return Object.entries(cats).map(([c, l]) => `${c}: ${l.join('; ')}`).join('\n');
}

// ---- AI mode via Vercel AI Gateway (OpenAI-compatible) ----
const MODEL = process.env.AI_MODEL || 'google/gemini-2.5-flash-lite';
// OIDC: Vercel injects a per-request token in the x-vercel-oidc-token header (no key needed).
function gwKey(req) { return process.env.AI_GATEWAY_API_KEY || (req && req.headers && req.headers['x-vercel-oidc-token']) || process.env.VERCEL_OIDC_TOKEN || null; }
const TOOLS = [
  { type: 'function', function: { name: 'add_item', description: 'Add a menu item to the cart', parameters: { type: 'object', properties: {
    item_id: { type: 'string', enum: MENU.items.map(i => i.id) }, toppings: { type: 'array', items: { type: 'string' } },
    qty: { type: 'integer' }, drink: { type: 'string', enum: MENU.drinks } }, required: ['item_id'] } } },
  { type: 'function', function: { name: 'remove_item', description: 'Remove a cart line by 1-based index', parameters: { type: 'object', properties: { index: { type: 'integer' } }, required: ['index'] } } },
  { type: 'function', function: { name: 'show_cart', description: 'Show the order summary', parameters: { type: 'object', properties: {} } } }
];
function sysPrompt(cart) {
  return `You are a friendly order-taker for The Hot Dog Stop food truck (DEMO ONLY, not a real order, no payments). ONLY offer items in this menu JSON; never invent items, toppings or prices. If an item's price is null say "price not listed". When a customer picks a hot dog or combo, ask which toppings (from that item's topping set: ny/chicago lists below, extra-cost ones marked) before adding it, unless they already said. For combos ask drink (water or yoohoo). Use the tools to change the cart. Keep replies short (1-3 sentences), mobile friendly. When they're done, call show_cart.
MENU: ${JSON.stringify(MENU.items.map(({ id, name, price, toppings, drink }) => ({ id, name, price, toppings, drink })))}
TOPPING SETS [id,name,extra$]: ${JSON.stringify(MENU.toppings)}
CURRENT CART: ${JSON.stringify(summary(cart))}`;
}
async function ai(history, cart, key) {
  if (!key) key = gwKey(); if (!key) throw new Error('no key');
  const msgs = [{ role: 'system', content: sysPrompt(cart) }, ...history.slice(-12)];
  let showSummary = false;
  for (let step = 0; step < 4; step++) {
    const r = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', { method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages: msgs, tools: TOOLS, temperature: 0.3, max_tokens: 400 }),
      signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('gateway ' + r.status + ' ' + (await r.text()).slice(0, 200));
    const msg = (await r.json()).choices[0].message;
    if (!msg.tool_calls || !msg.tool_calls.length) return { reply: msg.content || 'OK.', showSummary };
    msgs.push(msg);
    for (const tc of msg.tool_calls) {
      let a = {}; try { a = JSON.parse(tc.function.arguments || '{}'); } catch {}
      let out;
      if (tc.function.name === 'add_item') out = addItem(cart, a.item_id, a.toppings || [], a.qty, a.drink);
      else if (tc.function.name === 'remove_item') out = cart[a.index - 1] ? (cart.splice(a.index - 1, 1), { ok: true }) : { ok: false, error: 'no such line' };
      else { showSummary = true; out = summary(cart); }
      msgs.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ ...out, cart: summary(cart) }) });
    }
  }
  return { reply: 'Updated your cart.', showSummary };
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
  let out, mode = 'ai', note;
  if (b.mode !== 'fallback') {
    const before = JSON.stringify(cart);
    try { out = await ai([...history, { role: 'user', content: message }], cart, gwKey(req)); out.pending = null; }
    catch (e) { note = String(e.message).slice(0, 120); cart.splice(0, cart.length, ...JSON.parse(before)); }
  }
  if (!out) { mode = 'fallback'; out = fallback(message, cart, b.pending && byId[b.pending.item_id] ? b.pending : null); }
  res.status(200).json({ reply: out.reply, cart, summary: summary(cart), pending: out.pending || null, chips: out.chips || null,
    showSummary: !!out.showSummary, mode, model: mode === 'ai' ? MODEL : null, note: mode === 'fallback' ? note || null : null, demo: true });
};
module.exports._t = { fallback, addItem, summary };
