import {
  BUILT_IN_FRAMEWORKS,
  CLINICAL_LABELS,
  buildClinicalSystemPrompt,
  type ClinicalFramework,
} from "../../app/components/tabs/ClinicalTab";

// ─── buildClinicalSystemPrompt ────────────────────────────────────────────────

describe("buildClinicalSystemPrompt", () => {
  it("includes DSM-5 system prompt when DSM-5 framework is selected", () => {
    const dsm5 = BUILT_IN_FRAMEWORKS.find((f) => f.id === "dsm5")!;
    const result = buildClinicalSystemPrompt(dsm5, "en");
    expect(result).toContain("DSM-5");
    expect(result).toContain("clinical AI assistant");
  });

  it("includes ICD-11 system prompt when ICD-11 framework is selected", () => {
    const icd11 = BUILT_IN_FRAMEWORKS.find((f) => f.id === "icd11")!;
    const result = buildClinicalSystemPrompt(icd11, "en");
    expect(result).toContain("ICD-11");
  });

  it("returns a no-framework message when framework is null", () => {
    const result = buildClinicalSystemPrompt(null, "en");
    expect(result).toContain("No specific diagnostic framework is active.");
  });

  it("injects English language instruction when language is 'en'", () => {
    const dsm5 = BUILT_IN_FRAMEWORKS.find((f) => f.id === "dsm5")!;
    const result = buildClinicalSystemPrompt(dsm5, "en");
    expect(result).toContain("Respond in English.");
  });

  it("injects Polish language instruction when language is 'pl'", () => {
    const dsm5 = BUILT_IN_FRAMEWORKS.find((f) => f.id === "dsm5")!;
    const result = buildClinicalSystemPrompt(dsm5, "pl");
    expect(result).toContain("Odpowiadaj po polsku.");
  });

  it("uses custom framework system prompt", () => {
    const custom: ClinicalFramework = {
      id: "custom-1",
      name: "My Framework",
      description: "A custom diagnostic framework",
      systemPrompt: "Apply my custom criteria.",
      isCustom: true,
    };
    const result = buildClinicalSystemPrompt(custom, "en");
    expect(result).toContain("Apply my custom criteria.");
    expect(result).toContain("clinical AI assistant");
  });

  it("always includes the professional judgment disclaimer", () => {
    const result = buildClinicalSystemPrompt(null, "en");
    expect(result).toContain("does not replace professional clinical judgment");
  });
});

// ─── BUILT_IN_FRAMEWORKS ──────────────────────────────────────────────────────

describe("BUILT_IN_FRAMEWORKS", () => {
  it("contains DSM-5 and ICD-11", () => {
    const ids = BUILT_IN_FRAMEWORKS.map((f) => f.id);
    expect(ids).toContain("dsm5");
    expect(ids).toContain("icd11");
  });

  it("every built-in framework has a non-empty systemPrompt", () => {
    for (const f of BUILT_IN_FRAMEWORKS) {
      expect(f.systemPrompt.trim().length).toBeGreaterThan(0);
    }
  });

  it("built-in frameworks are NOT marked as custom", () => {
    for (const f of BUILT_IN_FRAMEWORKS) {
      expect(f.isCustom).toBeFalsy();
    }
  });
});

// ─── CLINICAL_LABELS ─────────────────────────────────────────────────────────

describe("CLINICAL_LABELS language switch", () => {
  it("English labels use 'Clinical Assistant' as title", () => {
    expect(CLINICAL_LABELS.en.title).toBe("Clinical Assistant");
  });

  it("Polish labels use 'Asystent Kliniczny' as title", () => {
    expect(CLINICAL_LABELS.pl.title).toBe("Asystent Kliniczny");
  });

  it("English labels use 'Diagnostic framework' for frameworkLabel", () => {
    expect(CLINICAL_LABELS.en.frameworkLabel).toBe("Diagnostic framework");
  });

  it("Polish labels have a frameworkLabel", () => {
    expect(CLINICAL_LABELS.pl.frameworkLabel).toBeTruthy();
  });

  it("both languages define a placeholder", () => {
    expect(CLINICAL_LABELS.en.placeholder.length).toBeGreaterThan(0);
    expect(CLINICAL_LABELS.pl.placeholder.length).toBeGreaterThan(0);
  });

  it("both languages define soapPrompt for session summaries", () => {
    expect(CLINICAL_LABELS.en.soapPrompt).toContain("SOAP");
    expect(CLINICAL_LABELS.pl.soapPrompt).toContain("SOAP");
  });

  it("voiceUnsupported message differs between languages", () => {
    expect(CLINICAL_LABELS.en.voiceUnsupported).not.toBe(CLINICAL_LABELS.pl.voiceUnsupported);
  });
});
