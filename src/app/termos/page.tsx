import Link from "next/link";

export const metadata = { title: "Termos de uso" };

export default function Termos() {
  return (
    <article className="prose-sm text-[13px] leading-relaxed space-y-3 pb-4">
      <h1 className="font-display font-bold text-2xl uppercase">Termos de uso</h1>
      <p className="text-[11px] text-ink/70">Vigente nesta versão do GreenScore. O pagamento do VIP continua manual: você combina o PIX com o administrador e o acesso é liberado no painel. Este texto não cria cobrança automática.</p>
      <h2 className="font-display font-bold uppercase text-lg">O que o site é</h2>
      <p>Ferramenta de estatística esportiva. Números, probabilidades e picks são estimativas calculadas com dados de terceiros (ESPN e, se você configurar, Football-Data.org, Sportmonks ou Bzzoiro). Não são recomendação personalizada de aposta nem promessa de resultado.</p>
      <h2 className="font-display font-bold uppercase text-lg">+18</h2>
      <p>O uso de qualquer leitura ligada a apostas é só para maiores de 18 anos. Ao criar conta, você declara ter 18 anos ou mais.</p>
      <h2 className="font-display font-bold uppercase text-lg">Sem garantia de lucro</h2>
      <p>Taxa histórica, odd justa, EV e intervalo de confiança descrevem uma amostra. Uma sequência curta (menos de 10 jogos) não autoriza certeza. Você pode perder dinheiro. O site não se responsabiliza por decisões tomadas com base nos números.</p>
      <h2 className="font-display font-bold uppercase text-lg">Conta e VIP</h2>
      <p>O teste e o VIP são liberados pelo administrador, com data de expiração. Não há checkout automático nesta versão. Contas administrativas não se excluem pelo formulário público.</p>
      <h2 className="font-display font-bold uppercase text-lg">Conduta</h2>
      <p>É proibido usar o site para fraude, invasão ou republicar os dados como se fossem seus sem citar a fonte. Podemos encerrar contas que abusem da API ou do painel.</p>
      <p><Link href="/privacidade" className="text-acc font-bold">Política de privacidade</Link> · <Link href="/jogo-responsavel" className="text-acc font-bold">Jogo responsável</Link></p>
    </article>
  );
}