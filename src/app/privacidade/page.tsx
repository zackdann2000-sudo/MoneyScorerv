import Link from "next/link";

export const metadata = { title: "Privacidade e LGPD" };

export default function Privacidade() {
  return (
    <article className="text-[13px] leading-relaxed space-y-3 pb-4">
      <h1 className="font-display font-bold text-2xl uppercase">Privacidade · LGPD</h1>
      <p>Controlador: o operador desta instalação do GreenScore. Contato do canal de exclusão: formulário em <Link href="/config#excluir" className="text-acc font-bold">Configurações → Excluir meus dados</Link> ou o e-mail do administrador cadastrado no painel.</p>
      <h2 className="font-display font-bold uppercase text-lg">Dados que guardamos</h2>
      <ul className="list-disc pl-4 space-y-1">
        <li>Conta: nome, e-mail e senha (hash, nunca a senha em claro).</li>
        <li>Uso: favoritos, preferências de alerta, sessões, visitas e comentários.</li>
        <li>Push: inscrição do navegador (endpoint e chaves) e, se você aceitar, o registro do consentimento.</li>
        <li>Picks e previsões do modelo, sem o seu nome, para o Track Record.</li>
      </ul>
      <h2 className="font-display font-bold uppercase text-lg">Para que serve</h2>
      <p>Entrar na conta, lembrar favoritos, enviar o alerta que você pediu e auditar se a pick acertou. Não vendemos lista de e-mail.</p>
      <h2 className="font-display font-bold uppercase text-lg">Base legal</h2>
      <p>Execução do serviço que você pediu (conta, alertas) e consentimento explícito para push. O aviso de jogo responsável é informação, não marketing.</p>
      <h2 className="font-display font-bold uppercase text-lg">Seus direitos</h2>
      <p>Você pode pedir acesso, correção ou exclusão. Logado, a exclusão apaga conta, sessão, favoritos, alertas, push e comentários na hora. Sem login, o pedido fica registrado para o administrador concluir, para ninguém apagar a conta de outra pessoa só com o e-mail.</p>
      <h2 className="font-display font-bold uppercase text-lg">Terceiros</h2>
      <p>Placares vêm da ESPN e das APIs que o admin colar no painel. Push pode passar pelo OneSignal se a chave REST estiver configurada. Essas empresas recebem só o necessário para a função (por exemplo, o identificador do aviso).</p>
      <p><Link href="/termos" className="text-acc font-bold">Termos</Link></p>
    </article>
  );
}