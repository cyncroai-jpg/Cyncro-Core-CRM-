import { LegalPage } from "@/app/components/LegalPage";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="OCTOBER 8, 2026">
      <p>This policy explains what Cyncro Core collects, why, and the choices you have. It covers people who use the Service (account holders and their teammates) and people whose details are stored in a workspace (customers and contacts).</p>
      <h2>What we collect</h2>
      <ul>
        <li><b>Account details:</b> name, email, password (stored only as a salted hash), company name and settings, and sign-in records (device, approximate address, time) so you can review where you're signed in.</li>
        <li><b>Workspace data:</b> whatever your company enters, such as contacts, deals, bookings, forms, contracts, invoices, messages and notes. Your company controls this data; we process it on their behalf.</li>
        <li><b>Usage and technical data:</b> logs needed to run and secure the Service, including requests, errors and rate-limit counters.</li>
        <li><b>Payment data:</b> handled by Stripe. We store your Stripe customer id and plan, never full card numbers.</li>
      </ul>
      <h2>How we use it</h2>
      <p>To provide the Service, send the emails and reminders you ask for, secure accounts (lockouts, two-factor sign-in), bill subscriptions, support you, and improve the product. We do not sell personal data and we do not use workspace data for advertising.</p>
      <h2>Cyncro AI</h2>
      <p>When a teammate asks Cyncro AI a question, the relevant records from that company's workspace are sent to our AI provider to produce an answer. Changes the assistant proposes are not made until a teammate approves them, and every action is logged under their name. Companies can cap monthly usage or ask us to disable the assistant.</p>
      <h2>Who we share it with</h2>
      <p>Service providers that help us run the Service: Cloudflare (hosting and database), Stripe (billing), our email provider, Twilio where SMS is enabled, Google where a teammate connects their account, and our AI provider for Cyncro AI. Each processes data only on our instructions. We share data with authorities only when legally required.</p>
      <h2>Retention</h2>
      <p>Workspace data is kept while the workspace is active and for 30 days after it closes, then deleted. Backups roll off within 30 days. Audit and security logs are kept up to 12 months.</p>
      <h2>Your rights</h2>
      <p>You can access, correct or export your data from the app, and ask us to delete your account. If you are a customer or contact of a company using the Service, contact that company first; they control your record. You may also contact us and we will help.</p>
      <h2>Security</h2>
      <p>Data is encrypted in transit and at rest. Sign-ins are rate-limited and locked after repeated failures. Two-factor sign-in is available to everyone and can be required company-wide. Each company's data is isolated by design.</p>
      <h2>Children</h2>
      <p>The Service is for businesses and is not directed at children under 16.</p>
      <h2>Changes and contact</h2>
      <p>We will announce material changes in the app or by email. Questions and requests: hello@app-cyncrocore.com.</p>
    </LegalPage>
  );
}
