/**
 * Texto dinâmico do card "Acesso de 24h" (puro — testável).
 * Recebe só o necessário para evitar acoplamento com o contexto.
 */
export type AcessoInfo = {
  isAdmin: boolean;
  accessActive: boolean;
  expiresAt: string | null;
};

/** Ex.: "02/01, 10:00" no fuso de Brasília. */
function quandoSP(iso: string): string {
  const s = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
  return s.replace(/\s+/g, " ").trim();
}

export function mensagemAcesso(u: AcessoInfo, agora: Date = new Date()): string {
  if (u.isAdmin) return "Você tem acesso vitalício a todas as análises e estatísticas.";
  const exp = u.expiresAt ? new Date(u.expiresAt) : null;
  const valido = exp !== null && Number.isFinite(exp.getTime()) && exp.getTime() > agora.getTime();
  if (!u.accessActive || !valido) return "Seu período de teste expirou. Faça upgrade para ver as oportunidades.";
  return `Seu período VIP de 24h termina em ${quandoSP(u.expiresAt as string)}`;
}