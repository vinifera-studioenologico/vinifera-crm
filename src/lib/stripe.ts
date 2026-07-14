import "server-only";
import Stripe from "stripe";

// Singleton server-only — mai importare in componenti client o bundle browser.
// Usa lazy init per evitare errori durante la build quando STRIPE_SECRET_KEY non è impostato.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY non configurato");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-06-24.dahlia",
    });
  }
  return _stripe;
}

// Alias per retro-compatibilità — usa getStripe() nelle chiamate effettive
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return Reflect.get(getStripe(), prop);
  },
});
