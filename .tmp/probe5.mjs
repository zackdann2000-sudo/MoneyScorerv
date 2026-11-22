import "dotenv/config";
const sm = process.env.SPORTMONKS_TOKEN;
const fid = 19713845;
const j = async (u) => { const r = await fetch(u); const tx = await r.text(); let d=null; try{d=JSON.parse(tx)}catch{}; return {status:r.status, d, tx:tx.slice(0,200)}; };
const tests = [
 `/fixtures/${fid}?include=lineups.player;formations&api_token=${sm}`,
 `/lineups?fixture_id=${fid}&api_token=${sm}`,
 `/lineups/fixture/${fid}?include=player&api_token=${sm}`,
 `/formations/fixture/${fid}?api_token=${sm}`,
 `/statistics/fixture/${fid}?api_token=${sm}`,
];
for (const p of tests) {
  const r = await j(`https://api.sportmonks.com/v3/football${p}`);
  console.log(p.split("?")[0], "->", r.status, r.d ? JSON.stringify(r.d).slice(0,260) : r.tx);
}
