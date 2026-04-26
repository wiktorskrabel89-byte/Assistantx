import type { Metadata } from "next";
import { LegalDocument } from "@/app/components/LegalDocument";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern access to and use of AssistantX.",
};

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      description="These Terms of Service govern your access to and use of AssistantX, including chat, uploads, integrations, exports, and related services. By using the site, you agree to these terms."
      lastUpdated="April 14, 2026"
    >
      <section>
        <h2>1. Acceptance Of Terms</h2>
        <p>
          By accessing or using AssistantX, you agree to be bound by these Terms of Service and by our Privacy Policy. If you do not agree, do not use the service.
        </p>
      </section>

      <section>
        <h2>2. Eligibility And Accounts</h2>
        <p>
          You must use the service only in compliance with applicable law. You are responsible for maintaining the security of your account, authentication methods, and any third-party integrations you connect.
        </p>
      </section>

      <section>
        <h2>3. Use Of The Service</h2>
        <p>
          You may use the service to create, store, and process prompts, files, outputs, and workspace data. We may update, improve, limit, suspend, or discontinue parts of the service at any time.
        </p>
      </section>

      <section>
        <h2>4. Acceptable Use</h2>
        <p>You agree not to use the service to:</p>
        <ul>
          <li>Break the law or violate the rights of others.</li>
          <li>Upload or submit content you do not have the right to use.</li>
          <li>Attempt to gain unauthorized access to accounts, systems, tokens, or data.</li>
          <li>Interfere with service availability, abuse rate limits, or bypass security controls.</li>
          <li>Use the service to distribute malware, spam, deceptive content, or harmful automated traffic.</li>
        </ul>
      </section>

      <section>
        <h2>5. Your Content</h2>
        <p>
          You retain ownership of content you submit to the service. By using AssistantX, you grant us a limited, non-exclusive license to host, store, reproduce, transmit, and process that content only as needed to operate, secure, and improve the service and to fulfill the features you request.
        </p>
      </section>

      <section>
        <h2>6. AI Outputs</h2>
        <p>
          AI-generated responses may be incomplete, inaccurate, offensive, or unsuitable for your use case. You are responsible for reviewing and validating outputs before relying on them for legal, financial, medical, security, engineering, or other high-impact decisions.
        </p>
      </section>

      <section>
        <h2>7. Integrations And Third-Party Services</h2>
        <p>
          Some features depend on third-party services such as authentication providers, cloud storage, code hosting, or AI APIs. Your use of those services may also be governed by their own terms and policies. We are not responsible for third-party services, content, availability, or security practices.
        </p>
      </section>

      <section>
        <h2>8. Fees And Changes</h2>
        <p>
          Unless explicitly stated otherwise, the service is provided on the pricing and availability terms shown within the app or on the site at the time of use. We may add, remove, or change features or pricing in the future.
        </p>
      </section>

      <section>
        <h2>9. Suspension And Termination</h2>
        <p>
          We may suspend or terminate access to the service at any time if we believe you have violated these terms, created risk for the service or other users, or if continued access is no longer operationally feasible.
        </p>
      </section>

      <section>
        <h2>10. Disclaimers</h2>
        <p>
          The service is provided on an as-is and as-available basis, without warranties of any kind, whether express or implied, to the maximum extent permitted by law. We do not guarantee uninterrupted availability, perfect accuracy, or that the service will meet every requirement.
        </p>
      </section>

      <section>
        <h2>11. Limitation Of Liability</h2>
        <p>
          To the maximum extent permitted by law, the operator of AssistantX will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for any loss of profits, revenue, goodwill, data, or business opportunity arising from or related to your use of the service.
        </p>
      </section>

      <section>
        <h2>12. Changes To These Terms</h2>
        <p>
          We may update these Terms of Service from time to time. When we do, we will post the revised version on this page and update the last updated date. Continued use of the service after the updated terms take effect means you accept them.
        </p>
      </section>

      <section>
        <h2>13. Contact</h2>
        <p>
          If you have questions about these Terms of Service, contact the operator at
          <a href="mailto:support.assistantx.pl@gmail.com" className="text-blue-600 underline ml-1">support.assistantx.pl@gmail.com</a>.
        </p>
        <p style={{ marginTop: 24 }}>
          <strong>Visit our homepage:</strong> <a href="https://assistantx.vercel.app" target="_blank" rel="noopener noreferrer">https://assistantx.vercel.app</a>
        </p>
      </section>
    </LegalDocument>
    <div className="mt-10 flex justify-center">
      {/* Embedded AssistantX Chatbot */}
      <div style={{ minWidth: 320, maxWidth: 400, width: '100%' }}>
        {typeof window !== 'undefined' && require("@/app/components/PublicChatWidget").default()}
      </div>
    </div>
  );
}