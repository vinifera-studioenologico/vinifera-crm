import { getSuggestedPricing, getCostsSettings } from "@/server/actions/costs";
import { PricingTable } from "../_components/PricingTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pricing — Vinifera" };

export default async function PricingPage() {
  const [pricing, settings] = await Promise.all([
    getSuggestedPricing(),
    getCostsSettings(),
  ]);
  return (
    <PricingTable
      data={pricing}
      targetMarginPercent={settings.defaultMarginPercent}
    />
  );
}
