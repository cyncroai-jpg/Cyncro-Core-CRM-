import { LegalPage } from "@/app/components/LegalPage";
import { PLANS } from "@/lib/core/billing";

/** Public pricing. Numbers come from the same plan table billing uses, so this page can never drift from what Stripe charges. */
export default function PricingPage() {
  const plans = [PLANS.starter, PLANS.growth, PLANS.scale];
  return (
    <LegalPage title="Simple pricing" eyebrow="14-DAY FREE TRIAL · NO CARD TO START">
      <p>Every plan includes the CRM, calendar and booking links, forms and landing pages, automations, contracts with e-signing, invoices, team chat, and Cyncro AI. Plans differ by seats and AI volume. Cancel any time.</p>
      <div className="priceGrid">
        {plans.map((p) => (
          <article key={p.id} className={p.id === "growth" ? "hot" : ""}>
            <small>{p.name.toUpperCase()}</small>
            <b>${(p.priceCents / 100).toLocaleString()}<i>/mo</i></b>
            <p>{p.blurb}</p>
            <ul>{p.perks.map((x) => <li key={x}>{x}</li>)}</ul>
            <a className="priceCta" href="/login?mode=signup">Start free trial</a>
          </article>
        ))}
      </div>
      <h2>Agencies</h2>
      <p>Run many client companies from one console: bulk setup, support access, snapshots pushed to every client, your brand on their workspaces, one invoice. <b>${(PLANS.agency.priceCents / 100)} per client company per month.</b> <a href="/login?mode=signup">Start a workspace</a>, then turn on Agency mode in Team Access.</p>
      <h2>Add-ons that use your own accounts</h2>
      <p>Texting runs through your Twilio number at Twilio's rates. Email runs through Resend or your Google account. Card payments to your customers run through your Stripe account. We never mark these up.</p>
      <h2>Questions</h2>
      <p>Email <a href="mailto:hello@app-cyncrocore.com">hello@app-cyncrocore.com</a>. Prices in US dollars, before tax.</p>
    </LegalPage>
  );
}
