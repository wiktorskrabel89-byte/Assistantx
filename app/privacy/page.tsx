import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/app/components/LegalDocument";
import { getUiLang } from "@/app/lib/get-ui-lang";
import { PAGE_STRINGS } from "@/app/lib/page-strings";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How AssistantX collects, uses, and protects your information.",
};

export default async function PrivacyPage() {
  const lang = await getUiLang();
  const title = lang === "pl" ? "Polityka prywatności" : "Privacy Policy";
  const lastUpdated =
    lang === "pl" ? "24 lipca 2026" : "July 24, 2026";
  const description = PAGE_STRINGS[lang].legal.privacyIntro;

  return (
    <LegalDocument title={title} description={description} lastUpdated={lastUpdated}>
      {lang === "pl" ? <PrivacyPl /> : <PrivacyEn />}
    </LegalDocument>
  );
}

function PrivacyEn() {
  return (
    <>
      <section>
        <h2>1. Who We Are</h2>
        <p>
          AssistantX is an AI assistant workspace. In this document, &ldquo;we&rdquo;, &ldquo;us&rdquo;, and &ldquo;our&rdquo; refer to the operator of the Service, and &ldquo;you&rdquo; refers to the person accessing the Service. If you have questions about anything in this policy, use the contact information in the final section.
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
        <p>When you connect an integration (for example GitHub or Google Drive), we receive limited profile and content data from that provider under the scope you approve.</p>
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
        <p>We do <strong>not</strong> sell your personal information, and we do not use your private workspace content to train foundation models.</p>
      </section>

      <section>
        <h2>4. Legal Bases (EEA / UK Users)</h2>
        <p>If you are located in the European Economic Area or the United Kingdom, we process your data on the following legal bases under the GDPR / UK GDPR:</p>
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
        <p>The Service is operated with a global user base. Your data may be processed in countries other than your own, including outside the EEA/UK. Where applicable, we rely on approved transfer mechanisms such as the European Commission&apos;s Standard Contractual Clauses.</p>
      </section>

      <section>
        <h2>7. Data Retention</h2>
        <p>We retain personal data for as long as your account is active and for a reasonable period afterwards to meet legal, accounting, or reporting requirements, defend legal claims, and analyze aggregate service metrics. Content in your workspace is retained until you delete it or your account is terminated. Deleted content may persist in backups for up to 90 days.</p>
      </section>

      <section>
        <h2>8. Security</h2>
        <p>We use administrative, technical, and physical safeguards designed to protect your information — including encryption in transit, authenticated access controls, and infrastructure managed by reputable providers. No system is perfectly secure, and we cannot guarantee absolute security.</p>
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
        <p>To exercise these rights, contact us using the details in the final section. We may need to verify your identity before responding.</p>
      </section>

      <section>
        <h2>10. Cookies</h2>
        <p>We use strictly necessary cookies to sign you in and remember basic preferences. We may also use analytics cookies to understand product usage. You can control non-essential cookies through your browser settings and any consent controls presented on the site.</p>
      </section>

      <section>
        <h2>11. Changes To This Policy</h2>
        <p>We may update this Privacy Policy from time to time. When we do, we will post the updated version on this page and change the &ldquo;Last updated&rdquo; date at the top. Material changes will also be highlighted in the Service or by email where appropriate.</p>
      </section>

      <section>
        <h2>12. Contact</h2>
        <p>Questions or requests about this Privacy Policy can be sent through our <Link href="/contact">Contact page</Link>. We aim to respond within 30 days.</p>
      </section>
    </>
  );
}

function PrivacyPl() {
  return (
    <>
      <section>
        <h2>1. Kim jesteśmy</h2>
        <p>AssistantX to obszar roboczy asystenta AI. W niniejszym dokumencie „my”, „nas” i „nasze” odnoszą się do operatora Usługi, a „Ty” — do osoby korzystającej z Usługi. W razie pytań dotyczących tej polityki skorzystaj z danych kontaktowych w ostatniej sekcji.</p>
      </section>

      <section>
        <h2>2. Jakie dane zbieramy</h2>
        <h3>2.1 Dane, które podajesz</h3>
        <ul>
          <li><strong>Dane konta:</strong> imię, adres email i dostawca uwierzytelniania (np. Google, GitHub, link magiczny).</li>
          <li><strong>Treści:</strong> wiadomości, prompty, przesyłane pliki, obrazy i dane obszaru roboczego tworzone podczas korzystania z Usługi.</li>
          <li><strong>Komunikacja:</strong> opinie, zgłoszenia na listę oczekujących i wiadomości wysyłane do nas.</li>
        </ul>
        <h3>2.2 Dane zbierane automatycznie</h3>
        <ul>
          <li><strong>Dane użycia:</strong> odwiedzane strony, używane funkcje, znaczniki czasu żądań i zdarzenia błędów.</li>
          <li><strong>Dane urządzenia i sieci:</strong> adres IP, typ przeglądarki, system operacyjny i przybliżona lokalizacja z IP.</li>
          <li><strong>Ciasteczka i lokalna pamięć:</strong> używane do uwierzytelniania, stanu sesji, preferencji obszaru roboczego i analityki.</li>
        </ul>
        <h3>2.3 Dane od stron trzecich</h3>
        <p>Gdy połączysz integrację (np. GitHub, Google Drive), otrzymujemy ograniczone dane profilu i treści od tego dostawcy w zakresie, który zatwierdzisz.</p>
      </section>

      <section>
        <h2>3. Jak wykorzystujemy dane</h2>
        <ul>
          <li>Do obsługi, utrzymania i ulepszania Usługi.</li>
          <li>Do przetwarzania Twoich promptów i plików przez wybranych dostawców modeli AI.</li>
          <li>Do uwierzytelniania i synchronizacji obszaru roboczego między urządzeniami.</li>
          <li>Do monitorowania wydajności, wykrywania nadużyć i zabezpieczania Usługi.</li>
          <li>Do komunikacji o aktualizacjach produktu, powiadomieniach bezpieczeństwa i wsparciu.</li>
          <li>Do wypełniania obowiązków prawnych i egzekwowania Regulaminu.</li>
        </ul>
        <p><strong>Nie sprzedajemy</strong> Twoich danych osobowych i nie wykorzystujemy Twoich prywatnych treści do trenowania modeli fundamentowych.</p>
      </section>

      <section>
        <h2>4. Podstawy prawne (użytkownicy z EOG / UK)</h2>
        <p>Jeśli znajdujesz się w Europejskim Obszarze Gospodarczym lub Wielkiej Brytanii, przetwarzamy Twoje dane w oparciu o następujące podstawy prawne wynikające z RODO / UK GDPR:</p>
        <ul>
          <li><strong>Umowa:</strong> aby świadczyć żądaną Usługę.</li>
          <li><strong>Prawnie uzasadnione interesy:</strong> aby zapewnić bezpieczeństwo Usługi, zapobiegać nadużyciom i ulepszać funkcje.</li>
          <li><strong>Zgoda:</strong> tam, gdzie wymagana (np. nieistotne ciasteczka lub emaile marketingowe).</li>
          <li><strong>Obowiązek prawny:</strong> gdy jesteśmy zobowiązani do przechowywania lub ujawnienia danych.</li>
        </ul>
      </section>

      <section>
        <h2>5. Udostępnianie danych</h2>
        <p>Udostępniamy dane tylko w opisanych sytuacjach:</p>
        <ul>
          <li><strong>Dostawcy usług:</strong> infrastruktura, hosting, baza danych, email, analityka i dostawcy modeli AI przetwarzający dane w naszym imieniu na podstawie pisemnych umów.</li>
          <li><strong>Integracje wybrane przez Ciebie:</strong> gdy łączysz zewnętrzną usługę, dane przekazywane do niej podlegają jej polityce prywatności.</li>
          <li><strong>Wnioski prawne:</strong> gdy wymaga tego prawo, przepis, nakaz sądowy lub inny ważny proces.</li>
          <li><strong>Bezpieczeństwo i przeciwdziałanie nadużyciom:</strong> gdy jest to konieczne dla ochrony praw, mienia lub bezpieczeństwa użytkowników albo społeczeństwa.</li>
          <li><strong>Transfery biznesowe:</strong> w związku z fuzją, przejęciem, finansowaniem lub sprzedażą aktywów, z zachowaniem ochrony Twoich danych.</li>
        </ul>
      </section>

      <section>
        <h2>6. Transfery międzynarodowe</h2>
        <p>Usługa działa globalnie. Twoje dane mogą być przetwarzane w krajach innych niż Twój, w tym poza EOG/UK. Tam, gdzie to konieczne, opieramy się o zatwierdzone mechanizmy transferu, takie jak Standardowe Klauzule Umowne Komisji Europejskiej.</p>
      </section>

      <section>
        <h2>7. Przechowywanie danych</h2>
        <p>Przechowujemy dane osobowe tak długo, jak konto jest aktywne oraz przez rozsądny czas potem, aby wypełnić wymagania prawne, księgowe lub sprawozdawcze, bronić roszczeń prawnych i analizować zagregowane metryki. Treści w Twoim obszarze roboczym są przechowywane, dopóki ich nie usuniesz lub konto nie zostanie zamknięte. Usunięte treści mogą pozostać w kopiach zapasowych do 90 dni.</p>
      </section>

      <section>
        <h2>8. Bezpieczeństwo</h2>
        <p>Stosujemy zabezpieczenia administracyjne, techniczne i fizyczne — w tym szyfrowanie w tranzycie, uwierzytelnianą kontrolę dostępu i infrastrukturę zarządzaną przez renomowanych dostawców. Żaden system nie jest w 100% bezpieczny i nie możemy zagwarantować bezwzględnego bezpieczeństwa.</p>
      </section>

      <section>
        <h2>9. Twoje prawa</h2>
        <p>W zależności od miejsca zamieszkania możesz mieć prawo do:</p>
        <ul>
          <li>Dostępu, poprawiania lub usuwania Twoich danych.</li>
          <li>Sprzeciwu wobec lub ograniczenia niektórych operacji przetwarzania.</li>
          <li>Otrzymania kopii danych w przenośnym formacie.</li>
          <li>Cofnięcia zgody na przetwarzanie oparte o zgodę.</li>
          <li>Złożenia skargi do lokalnego organu ochrony danych.</li>
        </ul>
        <p>Aby skorzystać z tych praw, skontaktuj się z nami. Możemy potrzebować potwierdzić Twoją tożsamość przed odpowiedzią.</p>
      </section>

      <section>
        <h2>10. Ciasteczka</h2>
        <p>Używamy niezbędnych ciasteczek do logowania i zapamiętywania podstawowych preferencji. Możemy też używać ciasteczek analitycznych. Ciasteczka nieistotne możesz kontrolować przez ustawienia przeglądarki oraz mechanizmy zgody na stronie.</p>
      </section>

      <section>
        <h2>11. Zmiany polityki</h2>
        <p>Możemy okresowo aktualizować niniejszą Politykę. Zmieniona wersja pojawi się na tej stronie z nową datą „Ostatniej aktualizacji”. Istotne zmiany zostaną również wyróżnione w Usłudze lub emailowo, gdy to właściwe.</p>
      </section>

      <section>
        <h2>12. Kontakt</h2>
        <p>Pytania lub prośby dotyczące niniejszej Polityki możesz przesłać przez naszą <Link href="/contact">stronę Kontakt</Link>. Staramy się odpowiadać w ciągu 30 dni.</p>
      </section>
    </>
  );
}
