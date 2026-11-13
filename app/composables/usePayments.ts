import { paymentsEnabled } from "@utils/payments";

export function usePayments() {
  async function confirmPayment(artworkId: string) {
    if (!paymentsEnabled) return;
    await navigateTo(`/payments/confirm/${artworkId}`);
  }

  async function payWithStripe(artworkId: string, artworkName: string) {
    if (!paymentsEnabled) return;
    try {
      const { url } = await $fetch<{ url: string | null }>(
        "/api/stripe/create-checkout-session",
        { method: "POST", body: { artworkId, artworkName } },
      );
      if (url) window.location.href = url;
    } catch (err) {
      throw new Error("Failed to retrieve stripe checkout session", { cause: err });
    }
  }

  return { confirmPayment, payWithStripe };
}
