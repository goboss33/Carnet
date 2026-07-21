/* Ces champs vivent désormais dans un module partagé (fiche commande + Nouvelle
   fiche). On les ré-exporte ici pour ne pas casser les imports « ./OrderFields ». */

export { TiersParts, FourrageChips, DeliveryFields } from "@/components/order-fields";
