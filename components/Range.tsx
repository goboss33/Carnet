"use client";

/* ---------------------------------------------------------------------------
   Curseur — remplace <input type="range"> partout dans Carnet.

   Un curseur natif saute à la position du doigt DÈS le contact, avant tout
   mouvement. Sur mobile, poser le pouce sur la barre pour amorcer un
   défilement changeait donc la valeur — et l'auto-save l'envoyait en base
   sans validation. `touch-action: pan-y` (globals.css) rend le défilement à
   la page, mais ne dit rien de cette réaction au toucher initial.

   Ici, la valeur ne bouge que si le geste s'avère horizontal : on mémorise
   la valeur au contact, on annule tout ce qui arrive tant que le doigt n'a pas
   franchi ~8 px vers la gauche ou la droite (et plus horizontalement que
   verticalement). À la souris, on s'arme d'emblée : le desktop est inchangé.

   Effet de bord voulu : un doigt posé puis relevé sans bouger ne change plus
   rien non plus.
--------------------------------------------------------------------------- */

import { useRef, type InputHTMLAttributes } from "react";

const ENGAGE_PX = 8;

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  value: number;
  onValueChange: (value: number) => void;
};

export default function Range({ value, onValueChange, ...rest }: Props) {
  const armed = useRef(true); // souris/clavier : rien à désarmer
  const startX = useRef(0);
  const startY = useRef(0);
  const startValue = useRef(value);

  return (
    <input
      {...rest}
      type="range"
      value={value}
      onPointerDown={(e) => {
        startValue.current = value;
        startX.current = e.clientX;
        startY.current = e.clientY;
        armed.current = e.pointerType !== "touch";
      }}
      onPointerMove={(e) => {
        if (armed.current) return;
        const dx = Math.abs(e.clientX - startX.current);
        const dy = Math.abs(e.clientY - startY.current);
        if (dx > ENGAGE_PX && dx > dy) armed.current = true;
      }}
      onPointerUp={() => {
        armed.current = true;
      }}
      onPointerCancel={() => {
        armed.current = true;
      }}
      onChange={(e) => {
        if (armed.current) {
          onValueChange(Number(e.currentTarget.value));
          return;
        }
        /* Geste pas encore reconnu comme horizontal : on remet la pastille où
           elle était. Indispensable — l'état React n'ayant pas changé, aucun
           rendu ne viendrait corriger le DOM tout seul. */
        e.currentTarget.value = String(startValue.current);
      }}
    />
  );
}
