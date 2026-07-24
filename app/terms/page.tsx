import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/app/components/LegalDocument";
import { getUiLang } from "@/app/lib/get-ui-lang";
import { PAGE_STRINGS } from "@/app/lib/page-strings";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern access to and use of AssistantX.",
};

export default async function TermsPage() {
  const lang = await getUiLang();
  const title = lang === "pl" ? "Regulamin" : "Terms of Service";
  const lastUpdated =
    lang === "pl" ? "24 lipca 2026" : "July 24, 2026";
  const description = PAGE_STRINGS[lang].legal.termsIntro;

  return (
    <LegalDocument title={title} description={description} lastUpdated={lastUpdated}>
      {lang === "pl" ? <TermsPl /> : <TermsEn />}
    </LegalDocument>
  );
}

function TermsEn() {
  return (
    <>
      <section>
        <h2>1. Agreement</h2>
        <p>By creating an account, joining the waitlist, or otherwise using the Service, you confirm that you have read, understood, and agreed to these Terms and to our <Link href="/privacy">Privacy Policy</Link>. If you do not agree to any part of the Terms, do not use the Service.</p>
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
        <p>You retain ownership of the content you submit, upload, or generate through the Service (&ldquo;Your Content&rdquo;). You grant us a worldwide, non-exclusive, royalty-free license to host, store, transmit, display, and process Your Content solely to operate, secure, and improve the Service and to provide the features you request.</p>
        <p>You are responsible for making sure Your Content does not infringe any third-party rights and complies with applicable law.</p>
      </section>

      <section>
        <h2>4. AI Features And Output</h2>
        <p>The Service uses large language models and other AI systems to generate output (&ldquo;Output&rdquo;). Because AI systems can produce inaccurate, misleading, incomplete, or offensive content, you agree that:</p>
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
        <p>The Service may integrate with third-party providers (for example GitHub, Google Drive, AI model APIs). Your use of those services is governed by their own terms and privacy policies, and we are not responsible for their content, availability, or practices.</p>
      </section>

      <section>
        <h2>7. Fees, Trials, And Changes</h2>
        <p>Some parts of the Service may be free, and other parts may require payment. Any paid features, prices, billing cycles, and refund terms will be presented in the Service before you commit to them. We may change pricing or introduce new charges by giving reasonable prior notice. Free trials may end at any time.</p>
      </section>

      <section>
        <h2>8. Intellectual Property</h2>
        <p>The Service, including its software, design, trademarks, and logos, is owned by AssistantX and its licensors and is protected by intellectual property laws. Except for the limited rights expressly granted in these Terms, you receive no rights in the Service.</p>
      </section>

      <section>
        <h2>9. Suspension And Termination</h2>
        <p>You may stop using the Service at any time. We may suspend or terminate your access to the Service — with or without notice — if you violate these Terms, if we are required to do so by law, or if continued access creates a material risk. On termination, your license to use the Service ends immediately.</p>
      </section>

      <section>
        <h2>10. Warranty Disclaimer</h2>
        <p>THE SERVICE AND OUTPUT ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;, WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ACCURACY. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.</p>
      </section>

      <section>
        <h2>11. Limitation Of Liability</h2>
        <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, ASSISTANTX AND ITS OPERATORS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS OPPORTUNITY, EVEN IF ADVISED OF THE POSSIBILITY. OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF OR RELATING TO THE SERVICE WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM AND (B) €100.</p>
      </section>

      <section>
        <h2>12. Indemnification</h2>
        <p>You agree to indemnify and hold harmless AssistantX, its operators, contractors, and licensors from any claims, damages, liabilities, and expenses (including reasonable legal fees) arising out of your Content, your use of the Service, or your violation of these Terms.</p>
      </section>

      <section>
        <h2>13. Governing Law And Disputes</h2>
        <p>These Terms are governed by the laws of the jurisdiction where the operator of AssistantX is established, without regard to conflict-of-laws principles. Disputes arising out of or in connection with the Service will be resolved in the courts of that jurisdiction, unless mandatory consumer-protection laws in your country of residence require otherwise.</p>
      </section>

      <section>
        <h2>14. Changes To These Terms</h2>
        <p>We may update these Terms from time to time. The updated version will be posted on this page with a new &ldquo;Last updated&rdquo; date. Material changes will be announced within the Service or by email. Continued use of the Service after changes take effect means you accept them.</p>
      </section>

      <section>
        <h2>15. Contact</h2>
        <p>Questions about these Terms of Service can be sent through our <Link href="/contact">Contact page</Link>.</p>
      </section>
    </>
  );
}

function TermsPl() {
  return (
    <>
      <section>
        <h2>1. Umowa</h2>
        <p>Tworząc konto, dołączając do listy oczekujących lub w inny sposób korzystając z Usługi, potwierdzasz, że zapoznałeś się z niniejszym Regulaminem i <Link href="/privacy">Polityką prywatności</Link>, rozumiesz je i akceptujesz. Jeśli nie zgadzasz się z jakąkolwiek częścią Regulaminu, nie korzystaj z Usługi.</p>
      </section>

      <section>
        <h2>2. Konta i bezpieczeństwo</h2>
        <ul>
          <li>Ponosisz odpowiedzialność za całą aktywność w ramach Twojego konta.</li>
          <li>Zachowaj poufność danych logowania i czynników uwierzytelniania.</li>
          <li>Niezwłocznie powiadom nas o podejrzeniu nieautoryzowanego dostępu lub incydencie bezpieczeństwa.</li>
          <li>Możemy zawiesić konta noszące oznaki naruszenia bezpieczeństwa lub nadużyć.</li>
        </ul>
      </section>

      <section>
        <h2>3. Twoje treści</h2>
        <p>Zachowujesz własność treści przesyłanych, ładowanych lub generowanych przez Usługę („Twoje treści”). Udzielasz nam ogólnoświatowej, niewyłącznej, bezpłatnej licencji na hostowanie, przechowywanie, przesyłanie, wyświetlanie i przetwarzanie Twoich treści wyłącznie w celu obsługi, zabezpieczania i ulepszania Usługi oraz świadczenia żądanych funkcji.</p>
        <p>Odpowiadasz za to, aby Twoje treści nie naruszały praw osób trzecich i były zgodne z prawem.</p>
      </section>

      <section>
        <h2>4. Funkcje AI i wyniki</h2>
        <p>Usługa korzysta z dużych modeli językowych i innych systemów AI do generowania wyników („Wyników”). Ponieważ systemy AI mogą generować niedokładne, wprowadzające w błąd, niekompletne lub obraźliwe treści, akceptujesz, że:</p>
        <ul>
          <li>Wyniki są dostarczane „tak jak są” i nie powinny być traktowane jako profesjonalna porada (prawna, medyczna, finansowa, inżynieryjna itp.).</li>
          <li>Odpowiadasz za sprawdzenie Wyników przed poleganiem na nich lub ich udostępnianiem.</li>
          <li>Podobne prompty od różnych użytkowników mogą generować podobne Wyniki — nie gwarantujemy unikalności.</li>
          <li>Niektóre Wyniki mogą podlegać prawom osób trzecich w zależności od źródeł odzwierciedlonych w danych treningowych — odpowiadasz za potwierdzenie prawa do ich użycia.</li>
        </ul>
      </section>

      <section>
        <h2>5. Dopuszczalne użycie</h2>
        <p>Zgadzasz się nie używać Usługi do:</p>
        <ul>
          <li>Naruszania prawa, przepisów lub praw innych osób.</li>
          <li>Przesyłania lub generowania treści niezgodnych z prawem, szkodliwych, seksualnie jednoznacznych z udziałem małoletnich lub promujących przemoc lub dyskryminację.</li>
          <li>Prób inżynierii wstecznej, dekompilacji lub obchodzenia zabezpieczeń.</li>
          <li>Scrapowania, crawlowania lub automatyzacji Usługi w sposób jawnie niedozwolony.</li>
          <li>Zakłócania działania Usługi, innych użytkowników lub infrastruktury.</li>
          <li>Budowania konkurencyjnego produktu lub trenowania konkurencyjnych modeli AI.</li>
        </ul>
      </section>

      <section>
        <h2>6. Usługi zewnętrzne i integracje</h2>
        <p>Usługa może integrować się z zewnętrznymi dostawcami (np. GitHub, Google Drive, API modeli AI). Twoje korzystanie z tych usług podlega ich własnym regulaminom i politykom prywatności, a my nie odpowiadamy za ich treści, dostępność ani praktyki.</p>
      </section>

      <section>
        <h2>7. Opłaty, wersje próbne i zmiany</h2>
        <p>Niektóre części Usługi mogą być darmowe, inne mogą wymagać opłaty. Płatne funkcje, ceny, cykle rozliczeniowe i zasady zwrotów będą prezentowane w Usłudze przed dokonaniem zobowiązania. Możemy zmieniać ceny lub wprowadzać nowe opłaty za rozsądnym uprzedzeniem. Bezpłatne wersje próbne mogą zakończyć się w każdej chwili.</p>
      </section>

      <section>
        <h2>8. Własność intelektualna</h2>
        <p>Usługa, w tym jej oprogramowanie, projekt, znaki towarowe i logo, jest własnością AssistantX i jej licencjodawców oraz jest chroniona prawem własności intelektualnej. Poza ograniczonymi prawami przyznanymi wyraźnie w niniejszym Regulaminie, nie nabywasz żadnych praw do Usługi.</p>
      </section>

      <section>
        <h2>9. Zawieszenie i zakończenie</h2>
        <p>Możesz zrezygnować z korzystania z Usługi w dowolnej chwili. Możemy zawiesić lub zakończyć Twój dostęp do Usługi — z lub bez uprzedzenia — jeśli naruszysz Regulamin, jeśli zobowiązuje nas do tego prawo lub jeśli dalszy dostęp stwarza istotne ryzyko. Wraz z zakończeniem licencja na korzystanie z Usługi wygasa natychmiast.</p>
      </section>

      <section>
        <h2>10. Wyłączenie gwarancji</h2>
        <p>USŁUGA I WYNIKI SĄ DOSTARCZANE „TAK JAK SĄ” I „W MIARĘ DOSTĘPNOŚCI”, BEZ GWARANCJI JAKIEGOKOLWIEK RODZAJU, WYRAŹNYCH LUB DOROZUMIANYCH, W TYM GWARANCJI PRZYDATNOŚCI HANDLOWEJ, PRZYDATNOŚCI DO OKREŚLONEGO CELU, NIENARUSZANIA PRAW I DOKŁADNOŚCI. NIE GWARANTUJEMY, ŻE USŁUGA BĘDZIE NIEPRZERWANA, WOLNA OD BŁĘDÓW LUB BEZPIECZNA.</p>
      </section>

      <section>
        <h2>11. Ograniczenie odpowiedzialności</h2>
        <p>W MAKSYMALNYM ZAKRESIE DOPUSZCZONYM PRZEZ PRAWO, ASSISTANTX I JEGO OPERATORZY NIE PONOSZĄ ODPOWIEDZIALNOŚCI ZA JAKIEKOLWIEK POŚREDNIE, PRZYPADKOWE, SZCZEGÓLNE, WTÓRNE ANI KARNE SZKODY, ANI ZA UTRATĘ ZYSKÓW, PRZYCHODÓW, DANYCH, RENOMY LUB OKAZJI BIZNESOWEJ, NAWET JEŚLI ZOSTALIŚMY POINFORMOWANI O TAKIEJ MOŻLIWOŚCI. NASZA CAŁKOWITA ODPOWIEDZIALNOŚĆ ZA JAKIEKOLWIEK ROSZCZENIE WYNIKAJĄCE Z USŁUGI LUB Z NIĄ ZWIĄZANE NIE PRZEKROCZY WIĘKSZEJ Z KWOT: (A) KWOT ZAPŁACONYCH NAM W 12 MIESIĄCACH PRZED ROSZCZENIEM I (B) 100 €.</p>
      </section>

      <section>
        <h2>12. Zwolnienie z odpowiedzialności</h2>
        <p>Zgadzasz się zwolnić AssistantX, jego operatorów, wykonawców i licencjodawców z odpowiedzialności za roszczenia, szkody, zobowiązania i wydatki (w tym rozsądne koszty prawne) wynikające z Twoich treści, Twojego korzystania z Usługi lub naruszenia niniejszego Regulaminu.</p>
      </section>

      <section>
        <h2>13. Prawo właściwe i spory</h2>
        <p>Niniejszy Regulamin podlega prawu jurysdykcji, w której siedzibę ma operator AssistantX, bez względu na zasady kolizyjne prawa. Spory wynikające z Usługi lub z nią związane rozstrzygają sądy tej jurysdykcji, chyba że obowiązkowe przepisy konsumenckie w Twoim kraju wymagają inaczej.</p>
      </section>

      <section>
        <h2>14. Zmiany Regulaminu</h2>
        <p>Możemy okresowo aktualizować niniejszy Regulamin. Zmieniona wersja pojawi się na tej stronie z nową datą „Ostatniej aktualizacji”. Istotne zmiany zostaną ogłoszone w Usłudze lub emailowo. Dalsze korzystanie z Usługi po wejściu zmian w życie oznacza ich akceptację.</p>
      </section>

      <section>
        <h2>15. Kontakt</h2>
        <p>Pytania dotyczące niniejszego Regulaminu możesz wysłać przez naszą <Link href="/contact">stronę Kontakt</Link>.</p>
      </section>
    </>
  );
}
