import Link from "next/link";

export const metadata = { title: "Jogo responsável" };

export default function JogoResponsavel() {
  return (
    <article className="text-[13px] leading-relaxed space-y-3 pb-4">
      <h1 className="font-display font-bold text-2xl uppercase">Jogo responsável · +18</h1>
      <p>Aposta não é renda. Uma taxa de 8/10 numa amostra pequena cabe dentro do acaso. O GreenScore não garante lucro e não empurra depósito.</p>
      <ul className="list-disc pl-4 space-y-1">
        <li>Defina um valor que você pode perder e pare ao chegar nele.</li>
        <li>Não aposte para recuperar prejuízo.</li>
        <li>Não use dinheiro de conta, aluguel ou empréstimo.</li>
        <li>Se o jogo virou obrigação, peça ajuda hoje.</li>
      </ul>
      <div className="bg-panel border border-line rounded-2xl p-3 space-y-2">
        <p className="font-bold">Canais de ajuda</p>
        <a className="block text-acc font-bold" href="https://www.cvv.org.br" target="_blank" rel="noreferrer">CVV — 188 · cvv.org.br</a>
        <a className="block text-acc font-bold" href="https://www.jogadoresanonimos.com.br" target="_blank" rel="noreferrer">Jogadores Anônimos</a>
        <p className="text-[11px] text-ink/70">Emergência de saúde: SAMU 192. Estes links são de organizações públicas ou de ajuda, não de casas de aposta.</p>
      </div>
      <p><Link href="/termos" className="text-acc font-bold">Termos</Link> · <Link href="/privacidade" className="text-acc font-bold">Privacidade</Link></p>
    </article>
  );
}