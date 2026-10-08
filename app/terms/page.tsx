import { LegalPage } from "@/app/components/LegalPage";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="OCTOBER 8, 2026">
      <p>These terms govern use of Cyncro Core, the business software available at app-cyncrocore.com and related addresses (the "Service"), provided by Cyncro Core ("we", "us"). By creating a company workspace or accepting an invitation to one, you agree to these terms on behalf of yourself and, where applicable, the company you represent.</p>
      <h2>1. Your account and workspace</h2>
      <p>Each company gets its own workspace. The person who creates it is the owner and is responsible for who is invited, what permissions they hold, and what is stored there. Keep your password private. Tell us right away if you believe an account has been compromised.</p>
      <h2>2. Your data</h2>
      <p>Everything you and your team enter, including contacts, deals, bookings, contracts, forms and messages, belongs to you. We process it only to run the Service for you. You can export all of it at any time from Team Access → Security, and you can ask us to delete your workspace.</p>
      <h2>3. Acceptable use</h2>
      <p>Use the Service lawfully. You are responsible for having consent to email, text or call the contacts you load, and for complying with CAN-SPAM, TCPA and similar rules where you operate. Don't use the Service to send spam, store unlawful content, or probe or disrupt the Service.</p>
      <h2>4. Electronic signatures</h2>
      <p>Contracts sent through the Service are signed electronically by typed name with recorded consent, timestamp and network details. You are responsible for the content of your agreements and for confirming that electronic signature is appropriate for them in your jurisdiction.</p>
      <h2>5. Plans, trials and payment</h2>
      <p>New workspaces start on a free trial. Paid plans are billed monthly in advance through Stripe and renew until cancelled. You may cancel any time from the billing portal; access continues to the end of the paid period. Fees are non-refundable except where the law requires otherwise. We may change prices with 30 days' notice.</p>
      <h2>6. Third-party services</h2>
      <p>The Service can connect to services you choose, such as Google, Stripe, Twilio and email providers. Their terms apply to those connections. We are not responsible for their availability.</p>
      <h2>7. Availability and support</h2>
      <p>We work to keep the Service available and back up data regularly, but we don't promise uninterrupted service. We may change or retire features with reasonable notice.</p>
      <h2>8. Disclaimer and limitation of liability</h2>
      <p>The Service is provided "as is". To the fullest extent permitted by law, we disclaim all warranties, and our total liability for any claim relating to the Service is limited to the fees you paid us in the 12 months before the claim. We are not liable for indirect or consequential losses.</p>
      <h2>9. Termination</h2>
      <p>You can close your workspace at any time. We may suspend or terminate accounts that violate these terms. On termination you have 30 days to export your data before it is deleted.</p>
      <h2>10. Changes and contact</h2>
      <p>We may update these terms; material changes will be announced in the app or by email. Continued use after a change means you accept it. Contact us at hello@app-cyncrocore.com.</p>
    </LegalPage>
  );
}
