import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/app/components/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern access to and use of AssistantX.",
};

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      description="These Terms of Service (the “Terms”) are a legal agreement between you and the operator of AssistantX (the “Service”). They govern your access to and use of the Service, including the website, chat, uploads, integrations, and any related features. By using the Service you agree to these Terms."
      lastUpdated="July 24, 2026"
    >
      <section>
        <h2>1. Agreement</h2>
        <p>
          By creating an account, joining the waitlist, or otherwise using the Service, you confirm that you have read, understood, and agreed to these Terms and to our <Link href="/privacy">Privacy Policy</Link>. If you do not agree to any part of the Terms, do not use the Service.
        </p>
      </section>

      <section>
        <h2>2. Accounts And Security</h2>
        <ul>
          <li>You are responsible for all activity that occurs under your account.</li>
          <li>Keep your login credentials and authentication factors confidential.</li>
          <li>Notify us promptly of any suspected unauthorized access or security incident.</li>
          <li>We may suspend accounts that show signs of compromise or abuse.</li>
        </ul>
      </section>

      <section>
        <h2>3. Your Content</h2>
        <p>
          You retain ownership of the content you submit, upload, or generate through the Service (&ldquo;Your Content&rdquo;). You grant us a worldwide, non-exclusive, royalty-free license to host, store, transmit, display, and process Your Content solely to operate, secure, and improve the Service and to provide the features you request.
        </p>
        <p>
          You are responsible for making sure Your Content does not infringe any third-party rights and complies with applicable law.
        </p>
      </section>

      <section>
        <h2>4. AI Features And Output</h2>
        <p>
          The Service uses large language models and other AI systems to generate output (&ldquo;Output&rdquo;). Because AI systems can produce inaccurate, misleading, incomplete, or offensive content, you agree that:
        </p>
        <ul>
          <li>Output is provided &ldquo;as is&rdquo; and should not be treated as professional advice (legal, medical, financial, engineering, or otherwise).</li>
          <li>You are responsible for reviewing Output before relying on it or sharing it.</li>
          <li>Similar prompts from different users may produce similar Output; we cannot guarantee uniqueness.</li>
          <li>Some Output may be subject to third-party rights depending on the sources reflected in training data — you are responsible for confirming your right to use it.</li>
        </ul>
      </section>

      <section>
        <h2>5. Acceptable Use</h2>
        <p>You agree not to use the Service to:</p>
        <ul>
          <li>Violate any law, regulation, or the rights of others.</li>
          <li>Upload or generate content that is unlawful, harmful, sexually explicit involving minors, or that promotes violence or discrimination.</li>
          <li>Attempt to reverse engineer, decompile, or circumvent security measures.</li>
          <li>Scrape, crawl, or automate the Service in a way that is not expressly permitted.</li>
          <li>Interfere with the Service, other users, or the underlying infrastructure.</li>
          <li>Use the Service to build a competing product, or to train competing AI models.</li>
        </ul>
      </section>

      <section>
        <h2>6. Third-Party Services And Integrations</h2>
        <p>
          The Service may integrate with third-party providers (for example GitHub, Google Drive, AI model APIs). Your use of those services is governed by their own terms and privacy policies, and we are not responsible for their content, availability, or practices.
        </p>
      </section>

      <section>
        <h2>7. Fees, Trials, And Changes</h2>
        <p>
          Some parts of the Service may be free, and other parts may require payment. Any paid features, prices, billing cycles, and refund terms will be presented in the Service before you commit to them. We may change pricing or introduce new charges by giving reasonable prior notice. Free trials may end at any time.
        </p>
      </section>

      <section>
        <h2>8. Intellectual Property</h2>
        <p>
          The Service, including its software, design, trademarks, and logos, is owned by AssistantX and its licensors and is protected by intellectual property laws. Except for the limited rights expressly granted in these Terms, you receive no rights in the Service.
        </p>
      </section>

      <section>
        <h2>9. Suspension And Termination</h2>
        <p>
          You may stop using the Service at any time. We may suspend or terminate your access to the Service — with or without notice — if you violate these Terms, if we are required to do so by law, or if continued access creates a material risk. On termination, your license to use the Service ends immediately.
        </p>
      </section>

      <section>
        <h2>10. Warranty Disclaimer</h2>
        <p>
          THE SERVICE AND OUTPUT ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;, WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ACCURACY. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
        </p>
      </section>

      <section>
        <h2>11. Limitation Of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, ASSISTANTX AND ITS OPERATORS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS OPPORTUNITY, EVEN IF ADVISED OF THE POSSIBILITY. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM AND (B) €100.
        </p>
      </section>

      <section>
        <h2>12. Indemnification</h2>
        <p>
          You agree to indemnify and hold harmless AssistantX, its operators, contractors, and licensors from any claims, damages, liabilities, and expenses (including reasonable legal fees) arising out of your Content, your use of the Service, or your violation of these Terms.
        </p>
      </section>

      <section>
        <h2>13. Governing Law And Disputes</h2>
        <p>
          These Terms are governed by the laws of the jurisdiction where the operator of AssistantX is established, without regard to conflict-of-laws principles. Disputes arising out of or in connection with the Service will be resolved in the courts of that jurisdiction, unless mandatory consumer-protection laws in your country of residence require otherwise.
        </p>
      </section>

      <section>
        <h2>14. Changes To These Terms</h2>
        <p>
          We may update these Terms from time to time. The updated version will be posted on this page with a new &ldquo;Last updated&rdquo; date. Material changes will be announced within the Service or by email. Continued use of the Service after changes take effect means you accept them.
        </p>
      </section>

      <section>
        <h2>15. Contact</h2>
        <p>
          Questions about these Terms of Service can be sent through our <Link href="/contact">Contact page</Link>.
        </p>
      </section>
    </LegalDocument>
  );
}
