import type { Metadata } from 'next';
import { ContactLine, LegalPage, OPERATOR } from '../legal-page';

export const metadata: Metadata = { title: 'Privacy policy · Translation Assistant' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="November 2026">
      <p className="mt-4">
        This policy explains what Translation Assistant, provided by {OPERATOR}, does with personal data.
      </p>

      <h2>Account data</h2>
      <p>
        For each user we store their name, email address, a securely hashed password, their role, and basic security
        records (sign-in sessions with IP address and browser, used to show your active sessions and to protect accounts).
      </p>

      <h2>Your organization&apos;s data</h2>
      <p>
        Your organization&apos;s clients, contacts, passport copies, jobs, documents, files and invoices are stored for your
        organization only. Other organizations can&apos;t see them, and the service&apos;s administrator manages accounts but does
        not look at this data. Your organization decides what it stores and is responsible for it towards its own clients.
      </p>

      <h2>Who else receives data</h2>
      <ul>
        <li>Cloudflare, which protects and delivers the site (and checks sign-ups for bots).</li>
        <li>Our email provider, to send invitations, password resets, confirmations and the invoices you choose to email.</li>
        <li>Google, only if your organization turns on the Google Translate helper, and only for the text you translate.</li>
      </ul>
      <p>We don&apos;t sell personal data or use it for advertising.</p>

      <h2>Security and retention</h2>
      <p>
        Data is stored on our server and backed up regularly. We keep it while your organization&apos;s account exists, and
        delete it when the account is closed, except where the law requires us to keep it.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask to see, correct or delete your personal data. For data an organization stores about its clients,
        contact that organization. For anything else: <ContactLine />.
      </p>
    </LegalPage>
  );
}
