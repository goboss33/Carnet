/* Helpers API Telegram (fetch natif, aucun SDK). */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const API = () => `https://api.telegram.org/bot${TOKEN}`;

export const MAIN_KEYBOARD = {
  keyboard: [
    [{ text: "🎂 Nouvelle commande" }, { text: "📅 Cette semaine" }],
    [{ text: "💰 Dépenses du mois" }, { text: "☰ Menu" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

export async function tg(method: string, payload: Record<string, unknown>) {
  const res = await fetch(`${API()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json().catch(() => null);
}

export const say = (chatId: number | bigint, text: string, extra: Record<string, unknown> = {}) =>
  tg("sendMessage", { chat_id: Number(chatId), text, parse_mode: "HTML", reply_markup: MAIN_KEYBOARD, ...extra });

export const sayInline = (
  chatId: number | bigint,
  text: string,
  inline: { text: string; callback_data: string }[][]
) =>
  tg("sendMessage", {
    chat_id: Number(chatId),
    text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: inline },
  });

export const editMessage = (
  chatId: number | bigint,
  messageId: number,
  text: string,
  inline?: { text: string; callback_data: string }[][]
) =>
  tg("editMessageText", {
    chat_id: Number(chatId),
    message_id: messageId,
    text,
    parse_mode: "HTML",
    ...(inline ? { reply_markup: { inline_keyboard: inline } } : {}),
  });

export const answerCallback = (id: string, text?: string) =>
  tg("answerCallbackQuery", { callback_query_id: id, ...(text ? { text } : {}) });

/** Télécharge la meilleure résolution d'une photo Telegram. */
export async function downloadPhoto(fileId: string): Promise<Buffer | null> {
  const info = await tg("getFile", { file_id: fileId });
  const path = info?.result?.file_path;
  if (!path) return null;
  const res = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${path}`);
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/** Envoie un message à tous les utilisateurs autorisés du bot. */
export async function notifyAll(text: string) {
  const ids = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  await Promise.allSettled(ids.map((id) => say(Number(id), text)));
}

/** Envoie une photo (bytes) à un chat. */
export async function sendPhotoTo(chatId: number | bigint, buf: Buffer, filename: string, caption?: string) {
  const fd = new FormData();
  fd.append("chat_id", String(Number(chatId)));
  if (caption) fd.append("caption", caption);
  fd.append("photo", new Blob([new Uint8Array(buf)]), filename);
  await fetch(`${API()}/sendPhoto`, { method: "POST", body: fd });
}

/** Envoie une série de photos à tous les utilisateurs autorisés (légende sur la première). */
export async function sendPhotosAll(buffers: Buffer[], caption?: string) {
  const ids = (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const id of ids) {
    for (let i = 0; i < buffers.length; i++) {
      await sendPhotoTo(Number(id), buffers[i], `inspiration-${i + 1}.jpg`, i === 0 ? caption : undefined).catch((e) =>
        console.error("sendPhoto", e)
      );
    }
  }
}
