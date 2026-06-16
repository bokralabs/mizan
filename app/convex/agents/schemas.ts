"use node";
/**
 * Centralized Zod schemas for all LLM-extracted data.
 *
 * Every LLM call in the pipeline MUST use a schema from this file.
 * These schemas serve three purposes:
 * 1. Generate JSON Schema for structured LLM output (tool_use / output_config)
 * 2. Runtime validation of LLM responses before upserting to Convex
 * 3. TypeScript type inference for pipeline code
 *
 * When adding a new data category, define its schema here and use
 * `verifyLLMOutput()` from verify.ts to validate the response.
 */

import { z } from "zod";

// ─── FISCAL YEAR FORMAT ─────────────────────────────────────────────────────
// Strict: "YYYY-YYYY" with dash separator only
const fiscalYearFormat = z
  .string()
  .regex(/^\d{4}-\d{4}$/, "Fiscal year must be YYYY-YYYY format (dash separator, e.g. 2024-2025)");

// ─── BUDGET ─────────────────────────────────────────────────────────────────

export const BudgetDataSchema = z.object({
  fiscalYear: fiscalYearFormat,
  totalRevenue: z.number().min(1, "Revenue must be in EGP billions (>= 1)"),
  totalExpenditure: z.number().min(1, "Expenditure must be in EGP billions (>= 1)"),
  deficit: z.number().describe("Overall deficit in EGP billions, negative = deficit"),
  gdp: z.number().min(1, "GDP must be in EGP billions (>= 1)"),
  sourceUrl: z.string().url("Source URL must be a valid URL"),
  period: z.string().optional().describe("e.g. July-October 2025"),
});
export type BudgetData = z.infer<typeof BudgetDataSchema>;

export const BudgetWikipediaSchema = z.object({
  fiscalYear: fiscalYearFormat,
  revenueUsd: z.number().min(0.1).describe("Revenue in USD billions"),
  expenditureUsd: z.number().min(0.1).describe("Expenditure in USD billions"),
  deficitUsd: z.number().describe("Deficit in USD billions, negative = deficit"),
  gdpNominalUsd: z.number().min(0.1).describe("Nominal GDP in USD billions"),
  year: z.string().regex(/^\d{4}$/, "Year must be YYYY format"),
});
export type BudgetWikipedia = z.infer<typeof BudgetWikipediaSchema>;

// ─── GOVERNMENT ─────────────────────────────────────────────────────────────

const OfficialSchema = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().min(1),
  titleEn: z.string().min(1),
  titleAr: z.string().min(1),
  role: z.enum(["president", "prime_minister", "minister", "deputy_minister", "governor", "mp", "senator", "speaker", "other"]).optional(),
  ministry: z.string().optional(),
  portfolioEn: z.string().optional(),
  portfolioAr: z.string().optional(),
});

export const CabinetDataSchema = z.object({
  officials: z.array(OfficialSchema).min(1, "Must have at least 1 official"),
  sourceUrl: z.string().url().optional(),
  asOfDate: z.string().optional(),
});
export type CabinetData = z.infer<typeof CabinetDataSchema>;

export const GovernorsDataSchema = z.object({
  governors: z.array(z.object({
    nameEn: z.string().min(1),
    nameAr: z.string().min(1),
    titleEn: z.string().min(1),
    titleAr: z.string().min(1),
    governorate: z.string().optional(),
  })).min(1, "Must have at least 1 governor"),
});
export type GovernorsData = z.infer<typeof GovernorsDataSchema>;

// ─── PARLIAMENT ─────────────────────────────────────────────────────────────

export const ParliamentCompositionSchema = z.object({
  parties: z.array(z.object({
    nameEn: z.string().min(1),
    nameAr: z.string().min(1),
    seats: z.number().int().min(0),
    color: z.string().optional(),
    isRuling: z.boolean().optional(),
  })).min(1, "Must have at least 1 party"),
  totalSeats: z.number().int().min(1).optional(),
  electionYear: z.string().optional(),
});
export type ParliamentComposition = z.infer<typeof ParliamentCompositionSchema>;

export const NameTransliterationSchema = z.object({
  translations: z.array(z.object({
    id: z.string(),
    nameEn: z.string().min(1),
  })).min(1),
});
export type NameTransliteration = z.infer<typeof NameTransliterationSchema>;

// ─── ECONOMY ────────────────────────────────────────────────────────────────

export const IMFProjectionsSchema = z.object({
  country: z.string(),
  gdpGrowth: z.record(z.string(), z.number()).describe("Year → growth rate %"),
  inflationRate: z.record(z.string(), z.number()).optional(),
  sourceUrl: z.string().url().optional(),
});
export type IMFProjections = z.infer<typeof IMFProjectionsSchema>;

export const IMFIndicatorsExtractionSchema = z.object({
  indicators: z.array(z.object({
    indicator: z.string().min(1),
    data: z.record(z.string(), z.number()).describe("Year → value"),
  })).min(1),
});
export type IMFIndicatorsExtraction = z.infer<typeof IMFIndicatorsExtractionSchema>;

export const InterestRateSchema = z.object({
  rate: z.number().min(0).max(100).describe("Interest rate as percentage"),
  tenor: z.string().optional().describe("e.g. 91-day, 1-year"),
  date: z.string().optional(),
  sourceUrl: z.string().url().optional(),
});
export type InterestRate = z.infer<typeof InterestRateSchema>;

export const BankRatesSchema = z.object({
  oneYear: z.number().min(0).max(100).optional(),
  threeYear: z.number().min(0).max(100).optional(),
  savingsRate: z.number().min(0).max(100).optional(),
  sourceUrl: z.string().url().optional(),
});
export type BankRates = z.infer<typeof BankRatesSchema>;

export const StockIndexSchema = z.object({
  value: z.number().min(0),
  change: z.number().optional(),
  changePercent: z.number().optional(),
  date: z.string().optional(),
});
export type StockIndex = z.infer<typeof StockIndexSchema>;

export const EconomicNarrativeSchema = z.object({
  titleEn: z.string().min(1),
  titleAr: z.string().min(1),
  summaryEn: z.string().min(10),
  summaryAr: z.string().min(10),
  insights: z.array(z.object({
    titleEn: z.string(),
    titleAr: z.string(),
    descriptionEn: z.string(),
    descriptionAr: z.string(),
    sentiment: z.enum(["positive", "negative", "neutral"]),
  })).optional(),
});
export type EconomicNarrative = z.infer<typeof EconomicNarrativeSchema>;

// ─── CONSTITUTION ───────────────────────────────────────────────────────────

export const ConstitutionArticleSchema = z.object({
  articleNumber: z.number().int().min(1),
  textEn: z.string().min(10),
  textAr: z.string().min(10),
  part: z.string().optional(),
  chapter: z.string().optional(),
  isAmended: z.boolean().optional(),
  amendmentDate: z.string().optional(),
  keywords: z.array(z.string()).optional(),
});

export const ConstitutionExtractionSchema = z.object({
  articles: z.array(ConstitutionArticleSchema).min(1, "Must extract at least 1 article"),
});
export type ConstitutionExtraction = z.infer<typeof ConstitutionExtractionSchema>;

// ─── INDUSTRY / INVESTMENT ──────────────────────────────────────────────────

export const InvestmentOpportunitySchema = z.object({
  nameEn: z.string().min(1),
  nameAr: z.string().optional(),
  sector: z.string(),
  location: z.string().optional(),
  governorate: z.string().optional(),
  capitalRange: z.string().optional(),
  description: z.string().optional(),
  sourceUrl: z.string().url().optional(),
});

export const IndustryResearchSchema = z.object({
  opportunities: z.array(InvestmentOpportunitySchema),
  totalFound: z.number().int().optional(),
  sourceUrl: z.string().url().optional(),
});
export type IndustryResearch = z.infer<typeof IndustryResearchSchema>;

export const CostBenchmarkSchema = z.object({
  laborCostPerMonth: z.number().optional().describe("Average monthly labor cost in EGP"),
  landCostPerSqm: z.number().optional().describe("Land cost per sqm in EGP"),
  constructionCostPerSqm: z.number().optional().describe("Construction cost per sqm in EGP"),
  electricityPerKwh: z.number().optional(),
  sourceUrl: z.string().url().optional(),
});
export type CostBenchmark = z.infer<typeof CostBenchmarkSchema>;

// ─── NEWS ───────────────────────────────────────────────────────────────────

export const NewsHeadlineSchema = z.object({
  titleEn: z.string().min(1),
  titleAr: z.string().min(1),
  summaryEn: z.string().optional(),
  summaryAr: z.string().optional(),
  category: z.enum(["economic", "political", "social", "international"]).optional(),
  sourceUrl: z.string().url(),
  publishedAt: z.string().optional(),
});

export const NewsExtractionSchema = z.object({
  headlines: z.array(NewsHeadlineSchema).min(1),
});
export type NewsExtraction = z.infer<typeof NewsExtractionSchema>;

// ─── NEWS (simple format for pipeline news step) ────────────────────────────

export const RawNewsItemSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  source: z.string().optional(),
});

export const RawNewsListSchema = z.object({
  items: z.array(RawNewsItemSchema).min(1),
});
export type RawNewsList = z.infer<typeof RawNewsListSchema>;

// ─── IDA INDUSTRY OPPORTUNITIES ─────────────────────────────────────────────

export const IDAOpportunitySchema = z.object({
  externalId: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  sector: z.string(),
  governorate: z.string().optional(),
  governorateAr: z.string().optional(),
  type: z.enum(["industrial_unit", "land_plot", "major_opportunity"]),
  costEgp: z.number().optional(),
  unitAreaSqm: z.number().optional(),
  status: z.enum(["available", "under_development", "reserved", "unknown"]).optional(),
  sourceUrl: z.string().url().optional(),
});

export const IDAOpportunitiesSchema = z.object({
  opportunities: z.array(IDAOpportunitySchema).min(0),
});
export type IDAOpportunities = z.infer<typeof IDAOpportunitiesSchema>;

// ─── GAFI INDUSTRY OPPORTUNITIES ────────────────────────────────────────────

export const GAFIOpportunitySchema = z.object({
  externalId: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  sector: z.string().optional(),
  governorate: z.string().optional(),
  governorateAr: z.string().optional(),
  type: z.enum(["free_zone", "investment_zone", "sme_program"]),
  costEgp: z.number().optional(),
  landAreaSqm: z.number().optional(),
  status: z.enum(["available", "under_development", "reserved", "unknown"]).optional(),
  descriptionEn: z.string().optional(),
  descriptionAr: z.string().optional(),
  sourceUrl: z.string().url().optional(),
});

export const GAFIOpportunitiesSchema = z.object({
  opportunities: z.array(GAFIOpportunitySchema).min(0),
});
export type GAFIOpportunities = z.infer<typeof GAFIOpportunitiesSchema>;

// ─── INDUSTRIAL COST BENCHMARKS (full structured form) ──────────────────────

const PriceRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
  source: z.string().optional(),
  note: z.string().optional(),
});

const LaborCostSchema = z.object({
  min: z.number(),
  max: z.number(),
});

export const IndustrialBenchmarksSchema = z.object({
  benchmarks: z.object({
    landPricePerSqm: z.object({
      upperEgypt: PriceRangeSchema.optional(),
      deltaRegion: PriceRangeSchema.optional(),
      greaterCairo: PriceRangeSchema.optional(),
      newCities: PriceRangeSchema.optional(),
      freeZones: PriceRangeSchema.optional(),
    }).optional(),
    constructionCostPerSqm: z.object({
      lightIndustry: PriceRangeSchema.optional(),
      heavyIndustry: PriceRangeSchema.optional(),
      warehouse: PriceRangeSchema.optional(),
    }).optional(),
    readyUnitPricePerSqm: PriceRangeSchema.optional(),
    freeZoneSetupCosts: z.object({
      registrationFee: z.number().optional(),
      annualLeaseFeePerSqm: z.number().optional(),
      minimumCapitalRequirement: z.number().optional(),
      source: z.string().optional(),
    }).optional(),
    laborCostMonthly: z.object({
      unskilledWorker: LaborCostSchema.optional(),
      skilledTechnician: LaborCostSchema.optional(),
      engineer: LaborCostSchema.optional(),
      source: z.string().optional(),
    }).optional(),
    utilityAndOverheadMonthly: z.object({
      electricity_per_kwh: z.number().optional(),
      water_per_m3: z.number().optional(),
      gas_per_m3: z.number().optional(),
      source: z.string().optional(),
    }).optional(),
    licensingAndPermits: z.object({
      industrialLicense: z.number().optional(),
      environmentalApproval: z.number().optional(),
      buildingPermit: z.number().optional(),
      source: z.string().optional(),
    }).optional(),
  }),
  sources: z.array(z.string()).optional(),
});
export type IndustrialBenchmarks = z.infer<typeof IndustrialBenchmarksSchema>;

// ─── COST ESTIMATES ──────────────────────────────────────────────────────────

export const CostEstimateItemSchema = z.object({
  nameEn: z.string().min(1),
  costEgp: z.number(),
  breakdown: z.object({
    landOrUnit: z.number().optional(),
    construction: z.number().optional(),
    equipment: z.number().optional(),
    workingCapital: z.number().optional(),
    licensing: z.number().optional(),
    other: z.number().optional(),
  }).optional(),
  methodology: z.string().optional(),
  confidence: z.enum(["low", "medium"]).optional(),
  sourceRefs: z.array(z.string()).optional(),
});

export const CostEstimatesSchema = z.object({
  estimates: z.array(CostEstimateItemSchema).min(0),
});
export type CostEstimates = z.infer<typeof CostEstimatesSchema>;

// ─── IDA INDUSTRIAL COMPLEXES (deep scrape pass 1) ──────────────────────────

export const IDAComplexSchema = z.object({
  externalId: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  governorate: z.string(),
  governorateAr: z.string().optional(),
  totalUnits: z.number().optional(),
  unitSizeRange: z.string().optional(),
  facilities: z.array(z.string()).optional(),
  sectors: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export const IDAComplexesSchema = z.object({
  complexes: z.array(IDAComplexSchema).min(0),
  incentives: z.object({
    sectorA: z.object({
      taxDeduction: z.string().optional(),
      duration: z.string().optional(),
      governorates: z.array(z.string()).optional(),
      conditions: z.array(z.string()).optional(),
    }).optional(),
    sectorB: z.object({
      taxDeduction: z.string().optional(),
      duration: z.string().optional(),
      governorates: z.array(z.string()).optional(),
      conditions: z.array(z.string()).optional(),
    }).optional(),
    general: z.array(z.string()).optional(),
  }).optional(),
});
export type IDAComplexes = z.infer<typeof IDAComplexesSchema>;

// ─── GAFI FREE ZONES (deep scrape pass 1) ───────────────────────────────────

export const GAFIZoneSchema = z.object({
  externalId: z.string().min(1),
  nameAr: z.string().min(1),
  nameEn: z.string().min(1),
  governorate: z.string().optional(),
  governorateAr: z.string().optional(),
  totalAreaSqm: z.number().optional(),
  keyIndustries: z.array(z.string()).optional(),
  benefits: z.array(z.string()).optional(),
  description: z.string().optional(),
});

export const GAFIZonesSchema = z.object({
  freeZones: z.array(GAFIZoneSchema).min(0),
  registrationFees: z.record(z.string(), z.unknown()).optional(),
  investmentLaw: z.record(z.string(), z.unknown()).optional(),
});
export type GAFIZones = z.infer<typeof GAFIZonesSchema>;

// ─── INVESTMENT INCENTIVES (deep scrape pass 2) ──────────────────────────────

export const LicensingStepSchema = z.object({
  step: z.number(),
  titleEn: z.string(),
  titleAr: z.string(),
  description: z.string(),
  estimatedDays: z.number().optional(),
  estimatedFeeEgp: z.number().optional(),
});

export const InvestmentIncentivesSchema = z.object({
  generalIncentives: z.array(z.string()).optional(),
  sectorA: z.object({
    taxDeduction: z.string().optional(),
    maxDuration: z.string().optional(),
    maxCapDeduction: z.string().optional(),
    governorates: z.array(z.string()).optional(),
    qualifyingActivities: z.array(z.string()).optional(),
  }).optional(),
  sectorB: z.object({
    taxDeduction: z.string().optional(),
    maxDuration: z.string().optional(),
    maxCapDeduction: z.string().optional(),
    governorates: z.array(z.string()).optional(),
    qualifyingActivities: z.array(z.string()).optional(),
  }).optional(),
  additionalBenefits: z.array(z.string()).optional(),
  cashIncentive: z.object({
    description: z.string().optional(),
    maxRate: z.string().optional(),
    condition: z.string().optional(),
  }).optional(),
  licensingSteps: z.array(LicensingStepSchema).optional(),
  freeZoneBenefits: z.array(z.string()).optional(),
});
export type InvestmentIncentives = z.infer<typeof InvestmentIncentivesSchema>;

// ─── COUNCIL ────────────────────────────────────────────────────────────────

export const CouncilVoteSchema = z.object({
  vote: z.enum(["approve", "reject", "abstain"]),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string().min(1),
  sourceVerified: z.boolean(),
});
export type CouncilVote = z.infer<typeof CouncilVoteSchema>;

// ─── GITHUB ISSUE CLASSIFICATION ────────────────────────────────────────────

/**
 * Flat schema for classifying a GitHub issue via tool_use.
 * `valid` is true for real data-correction reports, false for spam/off-topic.
 * When valid=false, only `reason` is meaningful; all correction fields are empty.
 * When valid=true, `page`, `dataPoint`, and `confidence` are required.
 */
export const GitHubIssueClassificationSchema = z.object({
  valid: z.boolean().describe("true if this is a real data correction, false if spam or off-topic"),
  reason: z.string().optional().describe("If valid=false, why this is not a valid data correction"),
  page: z.string().optional().describe("Which page the data is on (e.g. budget, debt, parliament)"),
  dataPoint: z.string().optional().describe("The specific data point being corrected"),
  currentValue: z.string().optional().describe("The value Mizan currently shows"),
  correctValue: z.string().optional().describe("The correct value that should be shown"),
  sourceUrl: z.string().optional().describe("URL proving the correct value"),
  confidence: z.enum(["high", "medium", "low"]).optional().describe("high if a source URL was given, medium if source was described, low if no source"),
});
export type GitHubIssueClassification = z.infer<typeof GitHubIssueClassificationSchema>;

// ─── GOVERNORATE ────────────────────────────────────────────────────────────

export const GovernorateStatsSchema = z.object({
  governorate: z.string().min(1),
  population: z.number().optional(),
  area: z.number().optional(),
  hdi: z.number().min(0).max(1).optional(),
  unemploymentRate: z.number().min(0).max(100).optional(),
  literacyRate: z.number().min(0).max(100).optional(),
});

export const GovernorateEnrichmentSchema = z.object({
  governorates: z.array(GovernorateStatsSchema),
});
export type GovernorateEnrichment = z.infer<typeof GovernorateEnrichmentSchema>;

// ─── UTILITY: Convert Zod schema to tool_use input_schema ───────────────────

/**
 * Convert a Zod schema to a ToolSchema compatible with the LLM provider interface.
 * This generates the JSON Schema needed for tool_use structured output.
 */
export function zodToToolSchema(
  name: string,
  description: string,
  schema: z.ZodType,
): { name: string; description: string; input_schema: Record<string, unknown> } {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  return {
    name,
    description,
    input_schema: jsonSchema,
  };
}
