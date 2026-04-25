import type { Metadata } from "next";
import { LegalDocument } from "@/app/components/LegalDocument";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How AssistantX collects, uses, stores, and protects personal information.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      description="This Privacy Policy explains how AssistantX collects, uses, stores, and shares information when you use the website, sign in, upload content, connect integrations, or use AI features."
      lastUpdated="April 14, 2026"
    >
      <section>
        <h2>1. Information We Collect</h2>
        <p>
          We collect information you provide directly, information generated while you use the service, and limited technical data needed to operate and secure the app.
        </p>
        <ul>
          <li>Account data, such as your email address, authentication provider, and session information.</li>
          <li>Workspace content, such as chat messages, pinned memory, workspace settings, exports, and cloud-synced state.</li>
          <li>Files and media you upload, including images and documents processed through the app.</li>
          <li>Integration data, such as Google Drive and GitHub connection status, imported file metadata, and temporary provider tokens used to complete linked features.</li>
          <li>Technical and usage data, such as IP address, browser type, device information, request logs, and analytics or performance telemetry.</li>
        </ul>
      </section>

      <section>
        <h2>2. How We Use Information</h2>
        <p>We use the information we collect to operate, improve, and secure the service.</p>
        <ul>
          <li>Provide chat, upload, search, integration, and export features.</li>
          <li>Authenticate users and sync workspace data across devices.</li>
          <li>Process prompts, files, and AI requests through supported infrastructure and model providers.</li>
          <li>Monitor reliability, prevent abuse, debug issues, and protect the service.</li>
          <li>Comply with legal obligations and enforce our Terms of Service.</li>
        </ul>
      </section>

      <section>
        <h2>3. Third-Party Services And Processors</h2>
        <p>
          AssistantX relies on third-party providers to deliver core features. Depending on how you use the site, your data may be processed by infrastructure or service providers such as Supabase for authentication and database storage, OpenRouter and model providers for AI responses, GitHub or Google for connected integrations, and hosting, CDN, logging, or analytics providers used to run the website.
        </p>
        <p>
          These providers process data under their own terms and privacy policies. We only send the information reasonably needed to deliver the requested feature.
        </p>
      </section>

      <section>
        <h2>4. Cookies, Local Storage, And Similar Technologies</h2>
        <p>
          The site uses cookies and browser storage to keep you signed in, store workspace state, preserve UI preferences, and support linked providers. Some third-party providers may also use cookies or similar technologies as part of their own services.
        </p>
      </section>

      <section>
        <h2>5. How We Share Information</h2>
        <p>We do not sell your personal information. We may share information only in the following situations:</p>
        <ul>
          <li>With service providers and subprocessors that help operate the app.</li>
          <li>When you explicitly request a feature that depends on a third-party integration or AI provider.</li>
          <li>To comply with applicable law, legal process, or enforceable government request.</li>
          <li>To investigate abuse, fraud, security incidents, or violations of these terms.</li>
          <li>As part of a merger, sale, financing, or transfer of some or all of the service.</li>
        </ul>
      </section>

      <section>
        <h2>6. Data Retention</h2>
        <p>
          We keep personal data for as long as it is reasonably needed to operate the service, maintain account access, provide cloud sync, resolve disputes, enforce agreements, or meet legal obligations. Data may be deleted sooner when no longer needed, and some logs or backups may persist for a limited time before permanent removal.
        </p>
      </section>

      <section>
        <h2>7. Security</h2>
        <p>
          We use reasonable technical and organizational measures to protect information, including authenticated access controls and provider-managed infrastructure. No internet service can guarantee absolute security, so you should avoid submitting highly sensitive information unless you are comfortable with that risk.
        </p>
      </section>

      <section>
        <h2>8. Your Choices And Rights</h2>
        <p>Depending on your location, you may have rights to access, correct, export, or delete certain personal data.</p>
        <ul>
          <li>You can stop using the service at any time.</li>
          <li>You can disconnect supported integrations and remove uploaded or stored content within the app when available.</li>
          <li>You can request deletion or account-related help through the contact method made available on this website.</li>
        </ul>
      </section>

      <section>
        <h2>9. Children&apos;s Privacy</h2>
        <p>
          The service is not intended for children under the age required by applicable law to use the service independently. If you believe a child has provided personal information without appropriate authorization, contact the site operator so the issue can be reviewed.
        </p>
      </section>

      <section>
        <h2>10. Changes To This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. When we do, we will post the updated version on this page and change the last updated date above. Continued use of the service after changes take effect means you accept the updated policy.
        </p>
      </section>

      <section>
        <h2>11. Contact</h2>
        <p>
          If you have questions about this Privacy Policy or your personal data, contact the operator using the contact details or support channel made available on this website.
        </p>
      </section>
    </LegalDocument>
  );
}