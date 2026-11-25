/**
 * Mapa de navegação — FONTE ÚNICA do menu lateral e do bottom sheet "Explorar".
 *
 * Antes existiam duas listas soltas no Shell (7 + 17 itens) mais uma faixa de 13
 * chips. O usuário via 24 destinos sem hierarquia. Aqui cada destino aparece uma
 * vez, em um grupo nomeado, e os menos usados ficam recolhidos ("Mais").
 *
 * Regras para adicionar um destino novo:
 *  1. Escolha o grupo pela INTENÇÃO ("ver jogo" vs "ver pick" vs "minha conta"),
 *     não pela fonte de dados.
 *  2. Se não é usado em quase toda sessão, vai para "Mais".
 *  3. Não duplique rota entre grupos — o mesmo link em dois lugares faz o
 *     usuário duvidar de qual é o "certo".
 */
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookOpen,
  BrainCircuit,
  Cable,
  CalendarRange,
  CircleDollarSign,
  CircleHelp,
  Crown,
  Gem,
  Globe,
  ListOrdered,
  Newspaper,
  Radar,
  Radio,
  Scale,
  Shield,
  Sparkles,
  Star,
  Swords,
  TrendingUp,
  Trophy,
  Users,
  Whistle,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export type NavGroup = {
  id: string;
  titulo: string;
  /** Grupo secundário: fica fechado por padrão no menu lateral. */
  recolhido?: boolean;
  itens: NavItem[];
};

export const GRUPOS: NavGroup[] = [
  {
    id: "jogos",
    titulo: "Jogos e dados",
    itens: [
      { href: "/hub", label: "Centro de Jogos", icon: CalendarRange },
      { href: "/hub/classificacao", label: "Classificação", icon: Trophy },
      { href: "/ao-vivo", label: "Ao vivo", icon: Radio },
      { href: "/ligas", label: "Ligas", icon: ListOrdered },
      { href: "/arbitros", label: "Árbitros", icon: Whistle },
      { href: "/palpites", label: "Palpites por liga", icon: ListOrdered },
      { href: "/noticias", label: "Notícias", icon: Newspaper },
    ],
  },
  {
    id: "analises",
    titulo: "Análises e picks",
    itens: [
      { href: "/supertips/palpites", label: "SuperTips IA", icon: Sparkles },
      { href: "/palpites-ia", label: "Palpites IA", icon: BrainCircuit },
      { href: "/money-tips", label: "Money Tips", icon: Gem },
      { href: "/ev", label: "Oportunidades +EV", icon: CircleDollarSign },
      { href: "/screener", label: "Screener avançado", icon: BarChart3 },
      { href: "/gameread", label: "Props (GameRead)", icon: Radar },
      { href: "/edge", label: "Edge (picks + radar)", icon: TrendingUp },
    ],
  },
  {
    id: "conta",
    titulo: "Minha conta",
    itens: [
      { href: "/favoritos", label: "Favoritos", icon: Star },
      { href: "/desempenho", label: "Track Record", icon: Scale },
      { href: "/config", label: "Conta e alertas", icon: CircleHelp },
      { href: "/metodologia", label: "Metodologia", icon: BookOpen },
    ],
  },
  {
    id: "mais",
    titulo: "Mais ferramentas",
    recolhido: true,
    itens: [
      { href: "/times", label: "Times", icon: Shield },
      { href: "/jogadores", label: "Jogadores", icon: Users },
      { href: "/edge/duelos", label: "Duelos", icon: Swords },
      { href: "/detector", label: "Detector", icon: Activity },
      { href: "/rankings", label: "Rankings por métrica", icon: BarChart3 },
      { href: "/forebet", label: "Forebet (tabela)", icon: Trophy },
      { href: "/apitou", label: "Apitou (props)", icon: Whistle },
      { href: "/kingstats", label: "King STATS", icon: Crown },
      { href: "/nerdytips", label: "NerdyTips", icon: BrainCircuit },
      { href: "/supertips/tendencias", label: "Desapitos", icon: TrendingUp },
      { href: "/fontes/sportmonks", label: "Sports Alert", icon: Cable },
      { href: "/fontes/football-data", label: "FD.org", icon: Globe },
    ],
  },
];

/** Ativo = rota exata ou sub-rota (evita acender "/hub" em "/hub/classificacao"). */
export function rotaAtiva(path: string, href: string): boolean {
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

/** Trilha de rotas que pertencem à aba "Jogos". */
export const ROTAS_JOGOS = ["/", "/hub", "/ao-vivo", "/ligas", "/noticias", "/times", "/jogos"];

/** Trilha de rotas que pertencem à aba "IA". */
export const ROTAS_IA = ["/supertips", "/palpites-ia", "/money-tips", "/ev", "/gameread", "/edge"];

export function pertence(path: string, trilha: string[]): boolean {
  return trilha.some((r) => rotaAtiva(path, r));
}
