import { prisma, currentTenant } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { automationsLive } from "@/lib/livestate";
import { DEFAULT_LEXICON, type Lexicon } from "@/lib/lexicon";
import { saveSettings } from "@/app/actions";
import Shell from "@/app/components/Shell";
import AutomationsSection from "./AutomationsSection";
import ConsignesField from "./ConsignesField";
import SettingsTabs from "./SettingsTabs";
import { Card, CardBody } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const input = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-(--color-brand)";
const label = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500";

const LEX_LABELS: Record<keyof Lexicon, string> = {
  product: "Le produit (singulier)",
  products: "Le produit (pluriel)",
  productArticle: "Avec article (« le gâteau »)",
  unit: "Unité d'œuvre (singulier)",
  units: "Unité d'œuvre (pluriel)",
  client: "Client·e (singulier)",
  clients: "Client·e·s (pluriel)",
  workshop: "Le lieu de travail",
  order: "Une commande (singulier)",
  orders: "Commandes (pluriel)",
  occasion: "L'occasion",
  deliveryVerb: "Le verbe de remise",
  pickupLabel: "Le retrait sur place",
};

export default async function Reglages() {
  const tenant = await currentTenant();
  const [raw, eff, live] = await Promise.all([
    prisma.settings.findUnique({ where: { tenantId: tenant.id } }),
    getSettings(tenant.id),
    automationsLive(tenant.id).catch(() => ({}) as Record<string, string[]>),
  ]);
  const lexRaw = (raw?.lexicon ?? {}) as Partial<Lexicon>;

  const panels: Record<string, React.ReactNode> = {
    perso: (
      <Card>
        <CardBody className="space-y-6 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Nom de l'application</span>
              <input name="brandName" defaultValue={raw?.brandName ?? ""} placeholder="Carnet" className={input} />
              <span className="mt-1 block text-[11px] text-zinc-400">Barre latérale, onglet du navigateur.</span>
            </label>
            <label className="block">
              <span className={label}>Couleur d'accent</span>
              <div className="flex items-center gap-2">
                <span className="size-9 shrink-0 rounded-lg border border-zinc-200 bg-(--color-brand)" aria-hidden />
                <input name="brandColor" defaultValue={raw?.brandColor ?? ""} placeholder="#4F46E5" pattern="#[0-9a-fA-F]{6}" className={input} />
              </div>
              <span className="mt-1 block text-[11px] text-zinc-400">Format #RRGGBB — appliquée après enregistrement.</span>
            </label>
          </div>
          <label className="flex items-center gap-3 text-sm text-zinc-700">
            <input type="checkbox" name="studioEnabled" defaultChecked={eff.studioEnabled} className="size-4 accent-(--color-brand)" />
            Activer <b>Studio</b> — bibliothèque de médias et publications réseaux sociaux (montage automatique)
          </label>
          <div>
            <p className="mb-1 text-[13px] font-semibold text-zinc-700">Lexique métier</p>
            <p className="mb-4 text-[11px] leading-relaxed text-zinc-400">
              Les mots de ton métier, utilisés dans l'interface et les messages. Vide = défaut cake design.
              C'est ce qui permet d'adapter l'app à un photographe (« shooting », « heures ») ou à tout autre artisan.
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(DEFAULT_LEXICON) as (keyof Lexicon)[]).map((k) => (
                <label key={k} className="block">
                  <span className={label}>{LEX_LABELS[k]}</span>
                  <input name={`lex_${k}`} defaultValue={lexRaw[k] ?? ""} placeholder={DEFAULT_LEXICON[k]} className={input} />
                </label>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>
    ),
    automatismes: (
      <Card>
        <CardBody className="p-6">
          <p className="mb-4 text-xs text-zinc-500">
            Tout ce que le bot fait pour toi, au fil de la vie d'une commande. Active, règle les délais, teste.
          </p>

            <p className="mb-4 text-xs text-zinc-500">
              Tout ce que le bot fait pour toi, au fil de la vie d'une commande. Active, règle les délais, teste.
            </p>
            <AutomationsSection
              live={live}
              texts={{ reviewUrl: { raw: raw?.reviewUrl ?? "", eff: eff.reviewUrl } }}
              toggles={{
                cronDigest: eff.cronDigest,
                cronEveningNudges: eff.cronEveningNudges,
                cronReviews: eff.cronReviews,
                cronBirthday: eff.cronBirthday,
                cronMonthly: eff.cronMonthly,
                cronFieldNudges: eff.cronFieldNudges,
                cronProduction: eff.cronProduction,
                gcalSync: eff.gcalSync,
              }}
              raw={{
                digestHour: raw?.digestHour ?? null,
                nudgeHour: raw?.nudgeHour ?? null,
                reviewDelayDays: raw?.reviewDelayDays ?? null,
                quoteFollowupDays: raw?.quoteFollowupDays ?? null,
                leadFollowupHours: raw?.leadFollowupHours ?? null,
                birthdayLeadDays: raw?.birthdayLeadDays ?? null,
                nudgeCooldownDays: raw?.nudgeCooldownDays ?? null,
                nudgeMaxPerEvening: raw?.nudgeMaxPerEvening ?? null,
                fieldFollowupDays: raw?.fieldFollowupDays ?? null,
                productionLeadDays: raw?.productionLeadDays ?? null,
                handoverLeadDays: raw?.handoverLeadDays ?? null,
              }}
              eff={{
                digestHour: eff.digestHour,
                nudgeHour: eff.nudgeHour,
                reviewDelayDays: eff.reviewDelayDays,
                quoteFollowupDays: eff.quoteFollowupDays,
                leadFollowupHours: eff.leadFollowupHours,
                birthdayLeadDays: eff.birthdayLeadDays,
                nudgeCooldownDays: eff.nudgeCooldownDays,
                nudgeMaxPerEvening: eff.nudgeMaxPerEvening,
                fieldFollowupDays: eff.fieldFollowupDays,
                productionLeadDays: eff.productionLeadDays,
                handoverLeadDays: eff.handoverLeadDays,
              }}
            />
            <p className="mt-4 text-[11px] text-zinc-400">
              Le token du bot, la liste des utilisateurs autorisés et la clé Gemini restent des variables d'environnement (sécurité).
            </p>
        </CardBody>
      </Card>
    ),
    objectifs: (
      <Card>
        <CardBody className="p-6">

            <div className="grid gap-4 sm:grid-cols-3">
              <label className="block">
                <span className={label}>CA mensuel (CHF)</span>
                <input name="goalCaMensuel" type="number" min="0" defaultValue={raw?.goalCaMensuel ?? ""} placeholder={String(eff.goalCaMensuel)} className={input} />
              </label>
              <label className="block">
                <span className={label}>Panier moyen (CHF)</span>
                <input name="goalPanierMoyen" type="number" min="0" defaultValue={raw?.goalPanierMoyen ?? ""} placeholder={String(eff.goalPanierMoyen)} className={input} />
              </label>
              <label className="block">
                <span className={label}>Avis Google</span>
                <input name="goalAvisGoogle" type="number" min="0" defaultValue={raw?.goalAvisGoogle ?? ""} placeholder={String(eff.goalAvisGoogle)} className={input} />
              </label>
              <label className="block">
                <span className={label}>Part mariage (% du CA)</span>
                <input name="goalPartMariage" type="number" min="0" max="100" defaultValue={raw?.goalPartMariage ?? ""} placeholder={String(eff.goalPartMariage)} className={input} />
              </label>
              <label className="block">
                <span className={label}>CA hors sur-mesure (%)</span>
                <input name="goalPartDecouple" type="number" min="0" max="100" defaultValue={raw?.goalPartDecouple ?? ""} placeholder={String(eff.goalPartDecouple)} className={input} />
              </label>
              <label className="block">
                <span className={label}>Abonnés Instagram</span>
                <input name="goalInstagram" type="number" min="0" defaultValue={raw?.goalInstagram ?? ""} placeholder={String(eff.goalInstagram)} className={input} />
              </label>
            </div>
        </CardBody>
      </Card>
    ),
    compta: (
      <Card>
        <CardBody className="space-y-6 p-6">

            <label className="block max-w-xs">
              <span className={label}>Forfait déplacement (CHF/km)</span>
              <input name="kmRate" type="number" step="0.05" min="0" defaultValue={raw?.kmRate ?? ""} placeholder={String(eff.kmRate)} className={input} />
              <span className="mt-1 block text-[11px] text-zinc-400">Aller-retour compté ×2. À confirmer avec ta fiduciaire.</span>
            </label>
          <div className="border-t border-zinc-100 pt-5">
            <p className="mb-4 text-[13px] font-semibold text-zinc-700">Paiement</p>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className={label}>Acompte par défaut (%)</span>
                  <input name="depositPct" type="number" min="0" max="100" defaultValue={raw?.depositPct ?? ""} placeholder={String(eff.depositPct)} className={input} />
                </label>
                <label>
                  <span className={label}>Moyen de paiement par défaut</span>
                  <select name="paymentDefault" defaultValue={eff.paymentDefault} className={input}>
                    <option value="twint">Twint</option>
                    <option value="virement">Virement</option>
                  </select>
                </label>
                <label>
                  <span className={label}>Numéro Twint</span>
                  <input name="twintNumber" defaultValue={raw?.twintNumber ?? ""} placeholder="+41 77 440 18 29" className={input} />
                </label>
                <label>
                  <span className={label}>Titulaire du compte</span>
                  <input name="accountHolder" defaultValue={raw?.accountHolder ?? ""} placeholder="Annie …" className={input} />
                </label>
                <label>
                  <span className={label}>IBAN</span>
                  <input name="iban" defaultValue={raw?.iban ?? ""} placeholder="CH.. …." className={input} />
                </label>
                <label>
                  <span className={label}>Banque</span>
                  <input name="bankName" defaultValue={raw?.bankName ?? ""} placeholder="Nom de la banque" className={input} />
                </label>
              </div>
          </div>
        </CardBody>
      </Card>
    ),
    assistant: (
      <Card>
        <CardBody className="p-6">

            <label className="mb-4 flex items-center gap-3 text-sm text-zinc-700">
              <input type="checkbox" name="assistantActive" defaultChecked={eff.assistantActive} className="h-4 w-4 accent-zinc-900" />
              Assistant actif (rédaction des messages par IA)
            </label>
            <label className="mb-4 block">
              <span className={label}>Signature</span>
              <input name="assistantSignature" defaultValue={raw?.assistantSignature ?? ""} placeholder="À très vite, Annie — Maman Gâteau" className={input} />
            </label>
            <ConsignesField defaultValue={raw?.assistantInstructions ?? ""} />
        </CardBody>
      </Card>
    ),
  };

  return (
    <Shell>
      <h1 className="mb-1 text-xl font-semibold tracking-tight text-zinc-900">Réglages</h1>
      <p className="mb-4 max-w-2xl text-[13px] text-zinc-500">
        Un champ laissé vide utilise la valeur par défaut. Le bouton Enregistrer sauvegarde tous les onglets d'un coup.
      </p>

      <form action={saveSettings} className="max-w-3xl">
        <SettingsTabs panels={panels} />
        <div className="sticky bottom-0 z-20 -mx-1 mt-6 border-t border-(--color-line) bg-(--color-surface)/95 px-1 py-3 backdrop-blur">
          <button className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700">
            Enregistrer les réglages
          </button>
        </div>
      </form>
    </Shell>
  );
}
