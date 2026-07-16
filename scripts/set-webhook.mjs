/* Enregistre le webhook Telegram — à lancer une fois après déploiement :
   TELEGRAM_BOT_TOKEN=xxx TELEGRAM_WEBHOOK_SECRET=yyy APP_URL=https://carnet.exemple.ch node scripts/set-webhook.mjs */
const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret, APP_URL: app } = process.env;
if (!token || !secret || !app) {
  console.error("Variables requises : TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, APP_URL");
  process.exit(1);
}
const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: `${app}/api/telegram`,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  }),
});
console.log(await res.json());
