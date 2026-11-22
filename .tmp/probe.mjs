import "dotenv/config";
const bz = process.env.BZZOIRO_TOKEN;
const fd = process.env.FOOTBALL_DATA_TOKEN;
const today = new Date().toISOString().slice(0,10);
const j = async (u, h) => { const r = await fetch(u, {headers: h||{}}); const tx = await r.text(); let d=null; try{d=JSON.parse(tx)}catch{}; return {status:r.status, d, tx: tx.slice(0,400)}; };

const ev = await j(`https://sports.bzzoiro.com/api/v2/events/?date_from=${today}&date_to=${today}&limit=5`, {Authorization:`Token ${bz}`});
console.log("BZ events:", ev.status, ev.d ? JSON.stringify(ev.d).slice(0,900) : ev.tx);
const id = ev.d?.results?.[0]?.id;
if (id) {
  const od = await j(`https://sports.bzzoiro.com/api/v2/events/${id}/odds/`, {Authorization:`Token ${bz}`});
  console.log("\nBZ odds:", od.status, od.d? JSON.stringify(od.d).slice(0,1600): od.tx);
  const lu = await j(`https://sports.bzzoiro.com/api/v2/events/${id}/lineups/`, {Authorization:`Token ${bz}`});
  console.log("\nBZ lineups:", lu.status, lu.d? JSON.stringify(lu.d).slice(0,1400): lu.tx);
  const h2h = await j(`https://sports.bzzoiro.com/api/v2/events/${id}/h2h/`, {Authorization:`Token ${bz}`});
  console.log("\nBZ h2h:", h2h.status, h2h.d? JSON.stringify(h2h.d).slice(0,900): h2h.tx);
}
const fdm = await j(`https://api.football-data.org/v4/matches?date=${today}`, {"X-Auth-Token": fd});
console.log("\nFD matches:", fdm.status, fdm.d? JSON.stringify(fdm.d).slice(0,1200): fdm.tx);
