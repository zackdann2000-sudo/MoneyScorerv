const today = new Date().toISOString().slice(0,10);
const ymd = today.replace(/-/g,"");
const j = async (u) => { const r = await fetch(u, {headers: {"User-Agent":"Mozilla/5.0 (Linux; Android 14) Chrome/126 Mobile Safari/537.36", Accept:"application/json"}}); const tx = await r.text(); let d=null; try{d=JSON.parse(tx)}catch{}; return {status:r.status, d, tx:tx.slice(0,300)}; };
const sb = await j(`https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/scoreboard?dates=${ymd}`);
console.log("ESPN sb:", sb.status, "events:", sb.d?.events?.length);
const ev = sb.d?.events?.[0];
if (ev) {
  const comp = ev.competitions?.[0];
  console.log("odds block:", JSON.stringify(comp?.odds?.[0])?.slice(0,700));
  const id = ev.id;
  const sm = await j(`https://site.api.espn.com/apis/site/v2/sports/soccer/bra.1/summary?event=${id}`);
  console.log("ESPN summary:", sm.status, "keys:", Object.keys(sm.d||{}).join(","));
  console.log("pickcenter:", JSON.stringify(sm.d?.pickcenter?.[0])?.slice(0,600));
  console.log("rosters length:", sm.d?.rosters?.length, "id:", id);
}
