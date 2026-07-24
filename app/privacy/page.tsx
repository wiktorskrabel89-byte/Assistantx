import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/app/components/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How AssistantX collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument
        title="Privacy Policy"
        description="This Privacy Policy describes how AssistantX (the “Service”) collects, uses, and shares information when you visit the website, create an account, or use any of the product’s features. By using the Service you agree to the practices described here."
        lastUpdated="July 24, 2026"
      >
        <section>
          <h2>1. Who We Are</h2>
          <p>
            AssistantX is an AI assistant workspace. In this document, “we”, “us”, and “our” refer to the operator of the Service, and “you” refers to the person accessing the Service. If you have questions about anything in this policy, use the contact information in the final section.
          </p>
        </section>

        <section>
          <h2>2. Information We Collect</h2>
          <h3>2.1 Information you provide</h3>
          <ul>
            <li><strong>Account information:</strong> your name, email address, and authentication provider (for example Google, GitHub, or magic link).</li>
            <li><strong>Content:</strong> messages, prompts, uploads, files, images, and workspace data you create while using the Service.</li>
            <li><strong>Communications:</strong> feedback, waitlist submissions, and messages you send us.</li>
          </ul>
          <h3>2.2 Information we collect automatically</h3>
          <ul>
            <li><strong>Usage data:</strong> pages visited, features used, request timestamps, and error events.</li>
            <li><strong>Device and network data:</strong> IP address, browser type, operating system, and approximate location derived from IP.</li>
            <li><strong>Cookies and local storage:</strong> used for authentication, session state, workspace preferences, and analytics.</li>
          </ul>
          <h3>2.3 Information from third parties</h3>
          <p>
            When you connect an integration (for example GitHub or Google Drive), we receive limited profile and content data from that provider under the scope you approve.
          </p>
        </section>

        <section>
          <h2>3. How We Use Information</h2>
          <ul>
            <li>Operate, maintain, and improve the Service.</li>
            <li>Process your prompts and uploads through selected AI model providers.</li>
            <li>Authenticate you and sync your workspace across devices.</li>
            <li>Monitor performance, detect abuse, and secure the Service.</li>
            <li>Communicate with you about product updates, security notices, and support requests.</li>
            <li>Comply with legal obligations and enforce our Terms of Service.</li>
          </ul>
          <p>
            We do <strong>not</strong> sell your personal information, and we do not use your private workspace content to train foundation models.
          </p>
        </section>

        <section>
          <h2>4. Legal Bases (EEA / UK Users)</h2>
          <p>
            If you are located in the European Economic Area or the United Kingdom, we process your data on the following legal bases under the GDPR / UK GDPR:
          </p>
          <ul>
            <li><strong>Contract:</strong> to provide the Service you request.</li>
            <li><strong>Legitimate interests:</strong> to keep the Service secure, prevent abuse, and improve features.</li>
            <li><strong>Consent:</strong> where required (for example non-essential cookies or marketing emails).</li>
            <li><strong>Legal obligation:</strong> where we are required to retain or disclose data by law.</li>
          </ul>
        </section>

        <section>
          <h2>5. Sharing And Disclosure</h2>
          <p>We share information only in the situations described below:</p>
          <ul>
            <li><strong>Service providers:</strong> infrastructure, hosting, database, email, analytics, and AI model providers that process data on our behalf under written agreements.</li>
            <li><strong>User-initiated integrations:</strong> when you connect a third-party service, the data flowing to that service is governed by their privacy policy.</li>
            <li><strong>Legal requests:</strong> when required by law, regulation, court order, or other valid legal process.</li>
            <li><strong>Safety and abuse prevention:</strong> where necessary to protect the rights, property, or safety of users or the public.</li>
            <li><strong>Business transfers:</strong> in connection with a merger, acquisition, financing, or sale of assets, with continued protection of your data.</li>
          </ul>
        </section>

        <section>
          <h2>6. International Transfers</h2>
          <p>
            The Service is operated with a global user base. Your data may be processed in countries other than your own, including outside the EEA/UK. Where applicable, we rely on approved transfer mechanisms such as the European Commission&apos;s Standard Contractual Clauses.
          </p>
        </section>

        <section>
          <h2>7. Data Retention</h2>
          <p>
            We retain personal data for as long as your account is active and for a reasonable period afterwards to meet legal, accounting, or reporting requirements, defend legal claims, and analyze aggregate service metrics. Content in your workspace is retained until you delete it or your account is terminated. Deleted content may persist in backups for up to 90 days.
          </p>
        </section>

        <section>
          <h2>8. Security</h2>
          <p>
            We use administrative, technical, and physical safeguards designed to protect your information — including encryption in transit, authenticated access controls, and infrastructure managed by reputable providers. No system is perfectly secure, and we cannot guarantee absolute security.
          </p>
        </section>

        <section>
          <h2>9. Your Rights</h2>
          <p>Depending on where you live you may have the right to:</p>
          <ul>
            <li>Access, correct, or delete personal data we hold about you.</li>
            <li>Object to or restrict certain processing.</li>
            <li>Receive a copy of your data in a portable format.</li>
            <li>Withdraw consent for processing that relies on consent.</li>
            <li>Lodge a complaint with your local data protection authority.</li>
          </ul>
          <p>
            To exercise these rights, contact us using the details in the final section. We may need to verify your identity before responding.
          </p>
        </section>

        <section>
          <h2>10. Cookies</h2>
          <p>
            We use strictly necessary cookies to sign you in and remember basic preferences. We may also use analytics cookies to understand product usage. You can control non-essential cookies through your browser settings and any consent controls presented on the site.
          </p>
        </section>

        <section>
          <h2>11. Changes To This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. When we do, we will post the updated version on this page and change the &ldquo;Last updated&rdquo; date at the top. Material changes will also be highlighted in the Service or by email where appropriate.
          </p>
        </section>

        <section>
          <h2>12. Contact</h2>
          <p>
            Questions or requests about this Privacy Policy can be sent through our <Link href="/contact">Contact page</Link>. We aim to respond within 30 days.
          </p>
        </section>
    </LegalDocument>
  );
}
