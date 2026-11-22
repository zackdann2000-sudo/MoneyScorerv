import "dotenv/config";
const sm = process.env.SPORTMONKS_TOKEN;
const today = new Date().toISOString().slice(0,10);
const j = async (u, h) => { const r = await fetch(u, {headers: h||{}}); const tx = await r.text(); let d=null; try{d=JSON.parse(tx)}catch{}; return {status:r.status, d, tx: tx.slice(0,300)}; };

const f = await j(`https://api.sportmonks.com/v3/football/fixtures/date/${today}?include=participants;league;scores;state&api_token=${sm}`);
console.log("SM fixtures:", f.status, f.d? "rows:"+(f.d.data?.length) : f.tx, f.d?.message||"");
if (f.d?.data?.length) {
  const fid = f.d.data[0].id;
  const o = await j(`https://api.sportmonks.com/v3/football/odds/pre-match/fixtures/${fid}?include=bookmaker;market&api_token=${sm}`);
  console.log("SM odds:", o.status, o.d? JSON.stringify(o.d).slice(0,500): o.tx);
  const l = await j(`https://api.sportmonks.com/v3/football/lineups/fixtures/${fid}?include=player&api_token=${sm}`);
  console.log("SM lineups:", l.status, l.d? JSON.stringify(l.d).slice(0,300): l.tx);
}
