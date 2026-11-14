import Link from "next/link";

export default function LegalFooter() {
  return (
    <footer className="mt-8 mb-2 px-1 text-[11px] leading-relaxed text-ink/75">
      <p className="font-extrabold text-warn">+18 · Jogo responsável</p>
      <p className="mt-1">O GreenScore publica estatística e probabilidade. Não há garantia de lucro. Apostar pode causar dependência. Se o jogo deixou de ser diversão, procure ajuda.</p>
      <p className="mt-1">
        <Link href="/jogo-responsavel" className="underline font-bold">Ajuda</Link>
        {" · "}
        <Link href="/termos" className="underline font-bold">Termos</Link>
        {" · "}
        <Link href="/privacidade" className="underline font-bold">Privacidade (LGPD)</Link>
        {" · "}
        <Link href="/config#excluir" className="underline font-bold">Excluir meus dados</Link>
      </p>
    </footer>
  );
}