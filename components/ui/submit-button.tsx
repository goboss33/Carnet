"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./button";

/* Bouton de soumission d'un <form action={…}> : passe seul en état « en cours »
   (spinner + désactivé) via useFormStatus — aucun câblage par formulaire. */
export function SubmitButton(props: ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return <Button type="submit" {...props} loading={props.loading ?? pending} />;
}
