import "dotenv/config";
const sm = process.env.SPORTMONKS_TOKEN;
const today = new Date().toISOString().slice(0,10);
const j = async (u) => { const r = await fetch(u); const tx = await r.text(); let d=null; try{d=JSON.parse(tx)}catch{}; return {status:r.status, d, tx:tx.slice(0,200)}; };
const f = await j(`https://api.sportmonks.com/v3/football/fixtures/date/${today}?api_token=${sm}`);
const ids = (f.d?.data||[]).map(x=>x.id);
console.log("fixture ids:", ids.join(","));
for (const fid of ids.slice(0,3)) {
  const o = await j(`https://api.sportmonks.com/v3/football/odds/pre-match/fixtures/${fid}?include=market&api_token=${sm}`);
  const rows = o.d?.data||[];
  const mk = [...new Set(rows.map(r=>`${r.market_id}:${r.market?.name||r.market_description}`))];
  console.log(`fx ${fid} odds rows ${rows.length} markets:`, mk.join(" | ").slice(0,400));
  const l1 = await j(`https://api.sportmonks.com/v3/football/lineups/fixture/${fid}?include=player;formation&api_token=${sm}`);
  console.log(`fx ${fid} lineups/fixture:`, l1.status, l1.d? (Array.isArray(l1.d.data)? "rows "+l1.d.data.length : JSON.stringify(l1.d).slice(0,150)) : l1.tx);
}
