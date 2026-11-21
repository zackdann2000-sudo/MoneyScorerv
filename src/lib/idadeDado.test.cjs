/**
 * Testes da idade do dado. O ponto crítico é a faixa que dispara o aviso na
 * tela: se ela errar, o app mostra "atualizado agora" com dado de três dias.
 */
const assert = require("assert");
const { idadeDoDado, LIMIAR_VELHO_MS, LIMIAR_PARADO_MS } = require("./idadeDado.js");

const AGORA = Date.parse("2026-11-21T12:00:00-03:00");
const menos = (ms) => new Date(AGORA - ms).toISOString();

function main() {
  /* ---------- entrada ausente ou inválida não inventa frescor ---------- */
  assert.strictEqual(idadeDoDado(null, AGORA), null, "null devolve null");
  assert.strictEqual(idadeDoDado(undefined, AGORA), null, "undefined devolve null");
  assert.strictEqual(idadeDoDado("", AGORA), null, "string vazia devolve null");
  assert.strictEqual(idadeDoDado("não é data", AGORA), null, "lixo devolve null");

  /* ---------- faixa atual (< 1h) ---------- */
  const zero = idadeDoDado(menos(0), AGORA);
  assert.strictEqual(zero.faixa, "atual");
  assert.strictEqual(zero.rotulo, "agora", "menos de 1 min é 'agora'");
  assert.strictEqual(zero.aviso, null, "atual não tem aviso");

  const dozeMin = idadeDoDado(menos(12 * 60000), AGORA);
  assert.strictEqual(dozeMin.faixa, "atual");
  assert.strictEqual(dozeMin.rotulo, "há 12 min");

  const quaseUmaHora = idadeDoDado(menos(LIMIAR_VELHO_MS - 60000), AGORA);
  assert.strictEqual(quaseUmaHora.faixa, "atual", "59 min ainda é atual");
  assert.strictEqual(quaseUmaHora.rotulo, "há 59 min");

  /* ---------- faixa velho (1h .. 24h) ---------- */
  const umaHora = idadeDoDado(menos(LIMIAR_VELHO_MS), AGORA);
  assert.strictEqual(umaHora.faixa, "velho", "60 min exatos já é velho");
  assert.strictEqual(umaHora.rotulo, "há 1h");
  assert.strictEqual(umaHora.aviso, null, "velho não abre banner, só muda a cor");

  const cincoHoras = idadeDoDado(menos(5 * 3600000), AGORA);
  assert.strictEqual(cincoHoras.faixa, "velho");
  assert.strictEqual(cincoHoras.rotulo, "há 5h");

  const quaseUmDia = idadeDoDado(menos(LIMIAR_PARADO_MS - 60000), AGORA);
  assert.strictEqual(quaseUmDia.faixa, "velho", "23h59 ainda é velho");

  /* ---------- faixa parado (>= 24h): o caso "a fonte caiu" ---------- */
  const umDia = idadeDoDado(menos(LIMIAR_PARADO_MS), AGORA);
  assert.strictEqual(umDia.faixa, "parado", "24h exatas já é parado");
  assert.strictEqual(umDia.rotulo, "há 1 dia");
  assert.ok(umDia.aviso, "parado precisa de aviso na tela");
  assert.ok(umDia.aviso.includes(umDia.dia), "o aviso cita o dia do dado");
  assert.ok(/parada/.test(umDia.aviso), "o aviso diz que a sincronização parou");

  const tresDias = idadeDoDado(menos(3 * 86400000), AGORA);
  assert.strictEqual(tresDias.faixa, "parado");
  assert.strictEqual(tresDias.rotulo, "há 3 dias", "plural de dia");

  /* ---------- dia no fuso de Brasília, não em UTC ---------- */
  // 22/11 00:30 UTC = 21/11 21:30 em Brasília: o dia do dado é 21/11.
  const viradaUtc = idadeDoDado("2026-11-22T00:30:00Z", Date.parse("2026-11-22T13:00:00Z"));
  assert.strictEqual(viradaUtc.dia, "21/11", "dia segue America/Sao_Paulo");

  /* ---------- relógio adiantado não gera idade negativa ---------- */
  const futuro = idadeDoDado(menos(-5 * 60000), AGORA);
  assert.strictEqual(futuro.ms, 0, "data no futuro vira 0, não negativo");
  assert.strictEqual(futuro.rotulo, "agora");

  /* ---------- formato real do apitou (microssegundos + offset) ---------- */
  const real = idadeDoDado("2026-11-20T07:48:08.253389-03:00", AGORA);
  assert.ok(real != null, "geradoEm do apitou é parseável");
  assert.strictEqual(real.dia, "20/11");
  assert.strictEqual(real.faixa, "parado", "dado do dia anterior abre o banner");

  /* ---------- numero epoch também é aceito ---------- */
  const epoch = idadeDoDado(AGORA - 7200000, AGORA);
  assert.strictEqual(epoch.rotulo, "há 2h");

  console.log(
    `✅ idadeDado ok — limiares: velho>=1h, parado>=24h · exemplo: ${real.rotulo} (${real.dia})`,
  );
}

main();
