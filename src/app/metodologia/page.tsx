import Link from "next/link";

export const metadata = { title: "Metodologia" };

export default function Metodologia() {
  return (
    <article className="text-[13px] leading-relaxed space-y-3 pb-6 text-ink">
      <h1 className="font-display font-bold text-2xl uppercase">Metodologia</h1>
      <p className="text-mut">Nada nesta página é uma promessa de lucro. Probabilidade estimada e valor esperado só aparecem quando há dado coletado. Sem retorno da API, a tela fica vazia.</p>
      <h2 className="font-display font-bold uppercase text-lg">Fontes</h2>
      <ul className="list-disc pl-4 space-y-1">
        <li>ESPN, sem chave: placar, minuto, eventos, estatísticas da partida, tabela e odds 1X2 quando a casa publica.</li>
        <li>Football-Data.org: só depois que a chave é colada no admin. Traz artilharia, assistências e pênaltis das competições do plano.</li>
        <li>Sportmonks e Bzzoiro: só com chave no admin. Sem chave, xG oficial e odds extras não são estimados.</li>
      </ul>
      <h2 className="font-display font-bold uppercase text-lg">Probabilidade</h2>
      <p>O 1X2 da lista usa gols pró e contra da tabela ESPN (mínimo 3 jogos por time), vantagem de casa e Poisson. Abaixo disso, o palpite não é gerado. A odd justa é 1 dividido pela taxa da amostra, com 6% de margem na conta interna. Não é cotação de casa.</p>
      <h2 className="font-display font-bold uppercase text-lg">Valor esperado</h2>
      <p>EV = taxa da amostra × odd de mercado − 1. A odd de mercado entra só se a ESPN (ou outra API configurada) devolver aquele mercado. Sem odd, o EV fica em branco. Intervalo de 95% é Wilson. Amostra menor que 10 jogos leva o aviso de amostra pequena e não é tratada como certeza.</p>
      <h2 className="font-display font-bold uppercase text-lg">O que não inventamos</h2>
      <p>Escanteios por tempo, xG individual, faixa de odd histórica, médias de árbitro e momentum minuto a minuto oficial não são preenchidos com número fictício. O campo some ou diz que a fonte não publicou.</p>
      <p><Link href="/ev" className="text-live font-bold">Ver oportunidades +EV</Link> · <Link href="/desempenho" className="text-live font-bold">Track Record</Link> · <Link href="/jogo-responsavel" className="text-live font-bold">+18</Link></p>
    </article>
  );
}