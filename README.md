# Hot Dog Stop — AI ordering DEMO
Demo only. It is not affiliated with The Hot Dog Stop (Brooksville, FL). There are no payments, and orders are never sent anywhere.
- `public/` is the static mobile chat UI. It works under any sub-path (relative assets), and its API base points to the Vercel deployment unless it's running on *.vercel.app.
- `api/chat.js` is a Vercel function. AI mode goes through the Vercel AI Gateway (model `AI_MODEL`, default `google/gemini-2.5-flash-lite`) with tool calls `add_item`/`remove_item`/`show_cart`, checked server-side against `menu.json`. If that fails it falls back to deterministic rules. CORS is allowed for https://computingmadeeasy.org.
- `MENU_NOTES.md` lists the sources and everything that was guessed. Run tests with `npm test`.
Keys live only in Vercel env (`AI_GATEWAY_API_KEY`, or OIDC on Vercel). Nothing secret is in the repo.
