import type { Metadata } from 'next';
import { ContactLine, LegalPage, OPERATOR } from '../legal-page';

export const metadata: Metadata = { title: 'Terms of service · Translation Assistant' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="November 2026">
      <p className="mt-4">
        Translation Assistant is a web application for translators to manage clients, jobs, documents and invoices.
        It is provided by {OPERATOR}. By creating an account you agree to these terms on behalf of yourself and the
        organization you register.
      </p>

      <h2>Accounts and organizations</h2>
      <ul>
        <li>Each organization has its own users and data. The person who signs up becomes its administrator and is responsible for who they invite.</li>
        <li>New organizations are reviewed before they can be used. We may decline a sign-up.</li>
        <li>Keep your password private. Tell us straight away if you think someone else has used your account.</li>
      </ul>

      <h2>Your data</h2>
      <ul>
        <li>The clients, documents, files and invoices you enter belong to your organization. We don&apos;t sell them or use them for anything other than running the service.</li>
        <li>You are responsible for having the right to store the personal data you enter (for example your clients&apos; details and passport copies), and for handling it lawfully.</li>
        <li>The optional Google Translate helper sends the text you choose to translate to Google, using your organization&apos;s own Google key.</li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>Don&apos;t use the service for anything illegal, to store malware, or to try to access another organization&apos;s data or the system itself.</li>
        <li>We may suspend an organization that breaks these terms or puts the service or other users at risk.</li>
      </ul>

      <h2>Availability</h2>
      <p>
        We work to keep the service available and backed up, but it is provided &quot;as is&quot;, without a guarantee of
        uninterrupted availability. Keep your own copies of documents you can&apos;t afford to lose.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can ask us to close your organization&apos;s account at any time. We delete its data after closing, except where we
        must keep something by law.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms; we&apos;ll tell administrators about important changes. Questions: <ContactLine />.
      </p>
    </LegalPage>
  );
}
