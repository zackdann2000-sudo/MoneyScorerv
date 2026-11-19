/**
 * Peso da forma recente — API canônica usada pelo modelo da IA Analista.
 *
 * A média da temporada trata um jogo de agosto igual a um da semana passada.
 * Aqui não: os últimos jogos pesam mais, então um time que vem de uma sequência
 * de vitórias (e de gols) sobe a probabilidade de marcar acima do que a média
 * chapada sugere. Os pesos e a janela vivem em `formaRecente.ts`
 * (1.5 nos 3 mais recentes, 1.0 do 4º ao 7º, 0.5 do 8º ao 10º — janela de 10).
 *
 * `getWeightedAverage` é um invólucro fino sobre `mediaPonderada`: existe como
 * nome estável para o motor e para a UI citarem a mesma regra, sem duplicar a
 * matemática. A série entra do jogo mais recente para o mais antigo.
 */
import { mediaPonderada, JANELA_FORMA } from "./formaRecente";

/** Nº de jogos considerados pela ponderação de forma (10). */
export const FORM_JANELA = JANELA_FORMA;

/**
 * Média ponderada pela forma recente. Devolve `null` quando não há nenhum
 * número válido na janela (o chamador decide o fallback).
 */
export function getWeightedAverage(valores: readonly (number | null | undefined)[]): number | null {
  return mediaPonderada(valores).media;
}
