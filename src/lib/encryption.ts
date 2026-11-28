/**
 * Cifragem em repouso dos segredos de fornecedor (AES-256-GCM).
 *
 * POR QUE EXISTE: `api_keys.token` guardava Sportmonks/Football-Data/OneSignal
 * em TEXTO CLARO. Qualquer dump, backup, réplica de leitura ou credencial de
 * banco vazada entregava todas as chaves pagas do produto. `maskKey()` só
 * protegia a tela, nunca o banco.
 *
 * DESENHO
 *  - AES-256-GCM: confidencialidade E autenticidade. Se o ciphertext for
 *    alterado (ou a chave estiver errada), a decifragem falha em vez de
 *    devolver lixo — não existe "decifrou parcialmente".
 *  - Chave mestra de `ENCRYPTION_SECRET` (env), reduzida a 32 bytes com
 *    SHA-256. O segredo deve ser aleatório e longo (`openssl rand -base64 32`);
 *    ele não é senha de usuário, é chave de máquina.
 *  - IV (nonce) aleatório de 12 bytes por cifragem: a mesma chave do provedor
 *    gravada duas vezes gera ciphertexts diferentes. Nunca reusar nonce é o que
 *    mantém GCM seguro.
 *  - Formato gravado: `enc:v1:<iv>.<tag>.<ciphertext>` em base64url (sem `.`
 *    dentro dos pedaços, então o split é seguro). O prefixo `enc:v1:` permite
 *    reconhecer texto claro legado e versionar o esquema no futuro.
 *
 * COMPATIBILIDADE (importante): `decrypt()` devolve texto claro intocado quando
 * o valor NÃO tem o prefixo. É o que deixa o app funcionar entre o deploy deste
 * código e a execução de `npm run keys:encrypt` — sem essa tolerância, todas as
 * chaves já gravadas parariam de funcionar no primeiro deploy.
 *
 * USO
 * ```ts
 * import { encrypt, decrypt, criptografiaConfigurada } from "@/lib/encryption";
 * const guardado = encrypt(token);   // lança se ENCRYPTION_SECRET não existir
 * const claro = decrypt(guardado);   // "" quando não dá para decifrar
 * ```
 *
 * RUNTIME: `node:crypto` — só roda onde há Node (route handlers/server), nunca
 * no Edge. `keys.ts` já é importado apenas por rotas Node.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Nome único da variável de ambiente (documentado em .env.example). */
export const ENV_SECRET = "ENCRYPTION_SECRET";
/** Prefixo de versão do esquema — muda junto com o algoritmo. */
export const PREFIXO = "enc:v1:";

const ALGORITMO = "aes-256-gcm";
/** 96 bits é o nonce recomendado para GCM (NIST SP 800-38D). */
const IV_BYTES = 12;
/** 128 bits de tag de autenticação (o padrão do GCM). */
const TAG_BYTES = 16;

/**
 * Chave de 32 bytes derivada do segredo.
 *
 * SHA-256 e não scrypt/KDF lento de propósito: o segredo é uma chave de máquina
 * (alta entropia), não uma senha humana. KDF lento aqui só encareceria cada
 * `getKey()` sem ganho real de segurança.
 *
 * `null` = ambiente sem `ENCRYPTION_SECRET`.
 */
function chaveMestra(): Buffer | null {
  const segredo = String(process.env[ENV_SECRET] ?? "").trim();
  if (!segredo) return null;
  return createHash("sha256").update(segredo, "utf8").digest();
}

/** `true` quando existe chave mestra configurada neste ambiente. */
export function criptografiaConfigurada(): boolean {
  return chaveMestra() != null;
}

/** `true` se o valor já está cifrado por este módulo. */
export function ehCriptografado(valor: unknown): boolean {
  return typeof valor === "string" && valor.startsWith(PREFIXO);
}

/**
 * Cifra `texto` e devolve `enc:v1:<iv>.<tag>.<ciphertext>`.
 *
 * Lança quando `ENCRYPTION_SECRET` não está configurada: gravar em texto claro
 * silenciosamente é exatamente o problema que este módulo veio corrigir.
 */
export function encrypt(texto: string): string {
  if (typeof texto !== "string") throw new TypeError("encrypt: esperado string");
  const chave = chaveMestra();
  if (!chave) {
    throw new Error(
      `${ENV_SECRET} não configurada: não é possível cifrar o segredo. ` +
        `Defina a variável no painel (Production/Preview) e no .env local.`,
    );
  }
  if (!texto) return ""; // vazio continua vazio: "apagar chave" não vira ciphertext
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITMO, chave, iv);
  const corpo = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIXO}${iv.toString("base64url")}.${tag.toString("base64url")}.${corpo.toString("base64url")}`;
}

/**
 * Decifra um valor gravado.
 *
 *  - valor sem prefixo → devolve como veio (texto claro legado, pré-migração);
 *  - valor vazio → "";
 *  - prefixo com formato inválido, chave mestra ausente/errada ou ciphertext
 *    adulterado → "" (quem chama decide cair para a env do provedor).
 *
 * Nunca lança: `getKey()` não pode derrubar uma chamada de fornecedor por causa
 * do cofre.
 */
export function decrypt(armazenado: string): string {
  if (typeof armazenado !== "string" || !armazenado) return "";
  if (!ehCriptografado(armazenado)) return armazenado;

  try {
    const chave = chaveMestra();
    if (!chave) return "";
    const partes = armazenado.slice(PREFIXO.length).split(".");
    if (partes.length !== 3) return "";
    const [ivB64, tagB64, corpoB64] = partes;
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const corpo = Buffer.from(corpoB64, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || !corpo.length) return "";
    const decipher = createDecipheriv(ALGORITMO, chave, iv);
    decipher.setAuthTag(tag);
    const claro = Buffer.concat([decipher.update(corpo), decipher.final()]);
    return claro.toString("utf8");
  } catch {
    /* tag inválida (chave trocada ou dado adulterado) */
    return "";
  }
}
