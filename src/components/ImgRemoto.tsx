"use client";

import type { ImgHTMLAttributes } from "react";

/**
 * `<img>` para imagem REMOTA de origem variável — com a decisão documentada.
 *
 * Por que não `next/image` aqui: os `src` destes pontos vêm de APIs de terceiros
 * (foto de jogador da API-Football, escudo da ESPN, foto de árbitro, foto do
 * provider do SuperTips). O otimizador do Next exige `images.remotePatterns`
 * com host fixo e **recusa** qualquer origem fora da lista; um curinga `**`
 * liberaria o otimizador para qualquer URL que o fornecedor devolver. Além
 * disso, cada escudo/foto passaria a contar na cota de otimização do plano.
 *
 * O que continua valendo (e é o que importa na tela): `width`/`height` +
 * `className` com tamanho fixo evitam CLS, e `loading="lazy"`/`onError` são
 * repassados por prop. O `alt` é obrigatório por tipo.
 *
 * QUANDO MIGRAR PARA `next/image`: com host conhecido, basta declarar
 * `images.remotePatterns` em `next.config.ts` e trocar `<ImgRemoto>` por
 * `<Image unoptimized>` nestes pontos — o resto do JSX não muda.
 *
 * O `eslint-disable` fica AQUI, em UM lugar, com a razão escrita acima; nos
 * componentes espalhados não há diretiva nenhuma.
 */
export default function ImgRemoto({ alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={alt ?? ""} {...props} />;
}
