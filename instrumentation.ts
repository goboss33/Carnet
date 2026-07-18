export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // En dev, le cron est coupé par défaut : branché sur la base de PROD via
    // tunnel SSH, il enverrait de vrais messages Telegram et exécuterait de
    // vraies bascules/publications depuis ta machine. CRON_IN_DEV=1 pour forcer.
    if (process.env.NODE_ENV !== "production" && process.env.CRON_IN_DEV !== "1") {
      console.log("Carnet cron : désactivé en dev (CRON_IN_DEV=1 pour l'activer) — aucune écriture ni message automatique.");
      return;
    }
    const { startCron } = await import("@/lib/cron");
    startCron();
  }
}
