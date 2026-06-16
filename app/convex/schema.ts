import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const guideAction = v.union(
  v.object({
    action: v.literal("navigate"),
    href: v.string(),
    reason: v.string(),
  }),
  v.object({
    action: v.literal("highlight"),
    selector: v.string(),
    title: v.string(),
    description: v.string(),
  }),
  v.object({
    action: v.literal("control"),
    tool: v.string(),
    inputs: v.any(),
    href: v.string(),
  }),
  v.object({
    action: v.literal("ask"),
    question: v.string(),
  }),
);

export default defineSchema({
  // GOVERNMENT HIERARCHY
  officials: defineTable({
    nameAr: v.string(),
    nameEn: v.string(),
    titleAr: v.string(),
    titleEn: v.string(),
    role: v.union(
      v.literal("president"),
      v.literal("prime_minister"),
      v.literal("minister"),
      v.literal("deputy_minister"),
      v.literal("governor"),
      v.literal("mp"),
      v.literal("senator"),
      v.literal("speaker"),
      v.literal("other")
    ),
    photoUrl: v.optional(v.string()),
    appointmentDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    isCurrent: v.boolean(),
    bioAr: v.optional(v.string()),
    bioEn: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sanadLevel: v.number(),
  })
    .index("by_role", ["role"])
    .index("by_isCurrent", ["isCurrent"])
    .index("by_role_and_isCurrent", ["role", "isCurrent"]),

  ministries: defineTable({
    nameAr: v.string(),
    nameEn: v.string(),
    mandateAr: v.optional(v.string()),
    mandateEn: v.optional(v.string()),
    currentMinisterId: v.optional(v.id("officials")),
    parentMinistryId: v.optional(v.id("ministries")),
    websiteUrl: v.optional(v.string()),
    employeeCount: v.optional(v.number()),
    establishedYear: v.optional(v.number()),
    sector: v.optional(v.union(
      v.literal("sovereignty"),
      v.literal("economic"),
      v.literal("social"),
      v.literal("infrastructure")
    )),
    sortOrder: v.number(),
  })
    .index("by_sortOrder", ["sortOrder"])
    .index("by_sector", ["sector"]),

  governorates: defineTable({
    nameAr: v.string(),
    nameEn: v.string(),
    capitalAr: v.string(),
    capitalEn: v.string(),
    currentGovernorId: v.optional(v.id("officials")),
    population: v.optional(v.number()),
    area: v.optional(v.number()),
    isCity: v.boolean(),
    geoJsonId: v.optional(v.string()),
    regionAr: v.optional(v.string()),
    regionEn: v.optional(v.string()),
  })
    .index("by_nameEn", ["nameEn"])
    .index("by_regionEn", ["regionEn"]),

  // PARLIAMENT
  parties: defineTable({
    nameAr: v.string(),
    nameEn: v.string(),
    abbreviation: v.optional(v.string()),
    color: v.string(),
    logoUrl: v.optional(v.string()),
    foundedYear: v.optional(v.number()),
    ideology: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
  })
    .index("by_nameEn", ["nameEn"]),

  parliamentMembers: defineTable({
    officialId: v.id("officials"),
    chamber: v.union(v.literal("house"), v.literal("senate")),
    partyId: v.optional(v.id("parties")),
    governorateId: v.optional(v.id("governorates")),
    electionMethod: v.union(
      v.literal("constituency"),
      v.literal("party_list"),
      v.literal("presidential_appointment")
    ),
    constituency: v.optional(v.string()),
    termStart: v.string(),
    termEnd: v.optional(v.string()),
    isCurrent: v.boolean(),
    seatNumber: v.optional(v.number()),
    campaignFinanceAr: v.optional(v.string()),
    campaignFinanceEn: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    phoneNumber: v.optional(v.string()),
  })
    .index("by_chamber", ["chamber"])
    .index("by_chamber_and_isCurrent", ["chamber", "isCurrent"])
    .index("by_partyId", ["partyId"])
    .index("by_governorateId", ["governorateId"]),

  committees: defineTable({
    nameAr: v.string(),
    nameEn: v.string(),
    chamber: v.union(v.literal("house"), v.literal("senate")),
    descriptionAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    chairpersonId: v.optional(v.id("officials")),
    type: v.union(
      v.literal("standing"),
      v.literal("special"),
      v.literal("general"),
      v.literal("ethics")
    ),
  })
    .index("by_chamber", ["chamber"])
    .index("by_chamber_and_type", ["chamber", "type"]),

  committeeMemberships: defineTable({
    committeeId: v.id("committees"),
    memberId: v.id("parliamentMembers"),
    role: v.union(
      v.literal("chair"),
      v.literal("vice_chair"),
      v.literal("member")
    ),
  })
    .index("by_committeeId", ["committeeId"])
    .index("by_memberId", ["memberId"]),

  // CONSTITUTION
  constitutionParts: defineTable({
    partNumber: v.number(),
    titleAr: v.string(),
    titleEn: v.string(),
    sortOrder: v.number(),
  })
    .index("by_sortOrder", ["sortOrder"]),

  constitutionArticles: defineTable({
    articleNumber: v.number(),
    partId: v.id("constitutionParts"),
    textAr: v.string(),
    textEn: v.string(),
    summaryAr: v.optional(v.string()),
    summaryEn: v.optional(v.string()),
    wasAmended2019: v.boolean(),
    originalTextAr: v.optional(v.string()),
    originalTextEn: v.optional(v.string()),
    keywords: v.array(v.string()),
  })
    .index("by_articleNumber", ["articleNumber"])
    .index("by_partId", ["partId"])
    .index("by_wasAmended2019", ["wasAmended2019"])
    .searchIndex("search_articles", {
      searchField: "textEn",
      filterFields: ["partId", "wasAmended2019"],
    }),

  articleCrossReferences: defineTable({
    fromArticleId: v.id("constitutionArticles"),
    toArticleId: v.id("constitutionArticles"),
    relationshipType: v.union(
      v.literal("references"),
      v.literal("amends"),
      v.literal("contradicts"),
      v.literal("elaborates")
    ),
    noteEn: v.optional(v.string()),
    noteAr: v.optional(v.string()),
  })
    .index("by_fromArticleId", ["fromArticleId"])
    .index("by_toArticleId", ["toArticleId"]),

  // BUDGET & SPENDING
  fiscalYears: defineTable({
    year: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    totalRevenue: v.optional(v.number()),
    totalExpenditure: v.optional(v.number()),
    deficit: v.optional(v.number()),
    gdp: v.optional(v.number()),
    sourceUrl: v.optional(v.string()),
    sanadLevel: v.number(),
  })
    .index("by_year", ["year"]),

  budgetItems: defineTable({
    fiscalYearId: v.id("fiscalYears"),
    category: v.union(v.literal("revenue"), v.literal("expenditure")),
    sectorAr: v.string(),
    sectorEn: v.string(),
    parentItemId: v.optional(v.id("budgetItems")),
    amount: v.number(),
    percentageOfTotal: v.optional(v.number()),
    percentageOfGdp: v.optional(v.number()),
    sourceUrl: v.optional(v.string()),
    sanadLevel: v.number(),
  })
    .index("by_fiscalYearId", ["fiscalYearId"])
    .index("by_fiscalYearId_and_category", ["fiscalYearId", "category"])
    .index("by_parentItemId", ["parentItemId"]),

  // NATIONAL DEBT
  debtRecords: defineTable({
    date: v.string(),
    totalExternalDebt: v.optional(v.number()),
    totalDomesticDebt: v.optional(v.number()),
    debtToGdpRatio: v.optional(v.number()),
    foreignReserves: v.optional(v.number()),
    totalDebtService: v.optional(v.number()),
    totalInterestPayments: v.optional(v.number()),
    sourceUrl: v.optional(v.string()),
    sourceNameEn: v.optional(v.string()),
    sanadLevel: v.number(),
  })
    .index("by_date", ["date"]),

  debtByCreditor: defineTable({
    debtRecordId: v.id("debtRecords"),
    creditorAr: v.string(),
    creditorEn: v.string(),
    creditorType: v.union(
      v.literal("multilateral"),
      v.literal("bilateral"),
      v.literal("commercial"),
      v.literal("other")
    ),
    amount: v.number(),
    percentageOfTotal: v.optional(v.number()),
    // Interest and debt service fields
    interestRate: v.optional(v.number()),
    annualDebtService: v.optional(v.number()),
    maturityYears: v.optional(v.number()),
    termsNoteEn: v.optional(v.string()),
    termsNoteAr: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
  })
    .index("by_debtRecordId", ["debtRecordId"])
    .index("by_creditorType", ["creditorType"]),

  // ELECTIONS
  elections: defineTable({
    type: v.union(
      v.literal("presidential"),
      v.literal("parliamentary_house"),
      v.literal("parliamentary_senate"),
      v.literal("referendum")
    ),
    year: v.number(),
    dateHeld: v.string(),
    totalRegisteredVoters: v.optional(v.number()),
    totalVotesCast: v.optional(v.number()),
    turnoutPercentage: v.optional(v.number()),
    sourceUrl: v.optional(v.string()),
    sanadLevel: v.number(),
  })
    .index("by_type", ["type"])
    .index("by_year", ["year"])
    .index("by_type_and_year", ["type", "year"]),

  electionResults: defineTable({
    electionId: v.id("elections"),
    candidateNameAr: v.string(),
    candidateNameEn: v.string(),
    partyId: v.optional(v.id("parties")),
    votes: v.number(),
    percentage: v.number(),
    isWinner: v.boolean(),
    sourceUrl: v.optional(v.string()),
    sanadLevel: v.number(),
  })
    .index("by_electionId", ["electionId"]),

  governorateElectionData: defineTable({
    electionId: v.id("elections"),
    governorateId: v.id("governorates"),
    registeredVoters: v.optional(v.number()),
    votesCast: v.optional(v.number()),
    turnoutPercentage: v.optional(v.number()),
    winnerNameAr: v.optional(v.string()),
    winnerNameEn: v.optional(v.string()),
    winnerVotes: v.optional(v.number()),
    winnerPercentage: v.optional(v.number()),
  })
    .index("by_electionId", ["electionId"])
    .index("by_governorateId", ["governorateId"])
    .index("by_electionId_and_governorateId", ["electionId", "governorateId"]),

  // TAX BRACKETS (tracked by AI pipeline from Egyptian Tax Authority)
  taxBrackets: defineTable({
    year: v.string(),
    fromAmount: v.number(),
    toAmount: v.optional(v.number()),
    rate: v.number(),
    personalExemption: v.optional(v.number()),
    lawReference: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sortOrder: v.number(),
    sanadLevel: v.number(),
  })
    .index("by_year", ["year"])
    .index("by_year_and_sortOrder", ["year", "sortOrder"]),

  // DATA SOURCES
  dataSources: defineTable({
    nameAr: v.string(),
    nameEn: v.string(),
    url: v.string(),
    type: v.union(
      v.literal("official_government"),
      v.literal("international_org"),
      v.literal("academic"),
      v.literal("media"),
      v.literal("other")
    ),
    lastAccessedDate: v.string(),
    notes: v.optional(v.string()),
    category: v.optional(v.union(
      v.literal("government"),
      v.literal("parliament"),
      v.literal("constitution"),
      v.literal("budget"),
      v.literal("debt"),
      v.literal("elections"),
      v.literal("economy"),
      v.literal("governorate_stats"),
      v.literal("industry"),
      v.literal("general")
    )),
    sanadLevel: v.number(), // 1=official_gov, 2=intl_org, 3=news, 4=other, 5=derived
  })
    .index("by_type", ["type"])
    .index("by_category", ["category"])
    .index("by_url", ["url"]),

  // ECONOMIC INDICATORS (fetched from World Bank and CBE every 12 hours)
  economicIndicators: defineTable({
    indicator: v.string(),
    year: v.optional(v.string()),
    date: v.string(),
    value: v.number(),
    unit: v.string(),
    sourceUrl: v.optional(v.string()),
    sourceNameEn: v.optional(v.string()),
    sanadLevel: v.number(), // 1=official_gov, 2=intl_org, 3=news, 4=other, 5=derived
  })
    .index("by_indicator", ["indicator"])
    .index("by_indicator_and_date", ["indicator", "date"]),

  // GOVERNORATE STATS (time-series indicators per governorate, multi-source)
  governorateStats: defineTable({
    governorateId: v.id("governorates"),
    indicator: v.string(), // "population", "area_km2", "density_per_km2", "hdi"
    year: v.string(), // "2023"
    value: v.number(),
    unit: v.string(), // "people", "km2", "per_km2", "index"
    sourceUrl: v.string(),
    sourceNameEn: v.optional(v.string()),
    sourceNameAr: v.optional(v.string()),
    sanadLevel: v.number(), // 1=official_gov, 2=intl_org, 3=news, 4=other, 5=derived
  })
    .index("by_governorateId", ["governorateId"])
    .index("by_governorateId_and_indicator", ["governorateId", "indicator"])
    .index("by_indicator_and_year", ["indicator", "year"])
    .index("by_governorateId_indicator_year", ["governorateId", "indicator", "year"]),

  // DATA CHANGE LOG (detailed per-operation audit trail)
  dataChangeLog: defineTable({
    refreshLogId: v.id("dataRefreshLog"),
    category: v.union(
      v.literal("government"),
      v.literal("parliament"),
      v.literal("constitution"),
      v.literal("budget"),
      v.literal("debt"),
      v.literal("elections"),
      v.literal("economy"),
      v.literal("governorate_stats"),
      v.literal("industry")
    ),
    action: v.union(
      v.literal("created"),
      v.literal("updated"),
      v.literal("validated"),
      v.literal("flagged"),
      v.literal("no_change")
    ),
    tableName: v.string(),
    recordId: v.optional(v.string()),
    descriptionAr: v.string(),
    descriptionEn: v.string(),
    previousValue: v.optional(v.string()),
    newValue: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_category", ["category"])
    .index("by_refreshLogId", ["refreshLogId"])
    .index("by_timestamp", ["timestamp"]),

  // DATA LINEAGE
  dataLineage: defineTable({
    // What data point this lineage is for
    tableName: v.string(),
    fieldName: v.string(),
    recordId: v.optional(v.string()),

    // The value
    value: v.string(),

    // Source provenance
    sourceType: v.union(
      v.literal("direct"),
      v.literal("calculated"),
      v.literal("estimated"),
      v.literal("ai_extracted"),
      v.literal("manual")
    ),
    sourceUrl: v.optional(v.string()),
    sourceNameAr: v.optional(v.string()),
    sourceNameEn: v.optional(v.string()),
    accessDate: v.string(),

    // If calculated, how was it derived?
    derivationMethod: v.optional(v.string()),
    derivationInputs: v.optional(v.array(v.string())),

    // Confidence
    confidence: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),

    // AI verification
    aiVerified: v.boolean(),
    aiVerificationNote: v.optional(v.string()),

    lastUpdated: v.number(),
  })
    .index("by_tableName", ["tableName"])
    .index("by_tableName_and_fieldName", ["tableName", "fieldName"])
    .index("by_tableName_and_recordId", ["tableName", "recordId"])
    .index("by_lastUpdated", ["lastUpdated"]),

  // AI RESEARCH REPORTS
  aiResearchReports: defineTable({
    titleAr: v.string(),
    titleEn: v.string(),
    category: v.union(
      v.literal("government"),
      v.literal("parliament"),
      v.literal("constitution"),
      v.literal("budget"),
      v.literal("debt"),
      v.literal("elections"),
      v.literal("economy"),
      v.literal("governorate_stats"),
      v.literal("industry")
    ),
    summaryAr: v.string(),
    summaryEn: v.string(),
    contentAr: v.string(),
    contentEn: v.string(),
    sourcesChecked: v.array(v.object({
      nameEn: v.string(),
      url: v.string(),
      accessible: v.boolean(),
    })),
    findingsCount: v.number(),
    discrepanciesFound: v.number(),
    generatedAt: v.number(),
    agentModel: v.string(),
  })
    .index("by_category", ["category"])
    .index("by_generatedAt", ["generatedAt"]),

  // DATA REFRESH LOG
  dataRefreshLog: defineTable({
    category: v.union(
      v.literal("government"),
      v.literal("parliament"),
      v.literal("constitution"),
      v.literal("budget"),
      v.literal("debt"),
      v.literal("economy"),
      v.literal("governorate_stats"),
      v.literal("industry"),
      v.literal("all")
    ),
    status: v.union(
      v.literal("success"),
      v.literal("failed"),
      v.literal("in_progress")
    ),
    recordsUpdated: v.optional(v.number()),
    sourceUrl: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    // Used by maintenance compaction to mark weekly summary entries
    isCompacted: v.optional(v.boolean()),
  })
    .index("by_category", ["category"])
    .index("by_category_and_startedAt", ["category", "startedAt"])
    .index("by_category_and_status_and_startedAt", ["category", "status", "startedAt"]),

  // LLM COUNCIL — multi-model data verification system
  councilSessions: defineTable({
    triggerType: v.union(
      v.literal("github_issue"),
      v.literal("data_refresh"),
      v.literal("manual")
    ),
    triggerRef: v.string(),
    category: v.union(
      v.literal("government"),
      v.literal("parliament"),
      v.literal("constitution"),
      v.literal("budget"),
      v.literal("debt"),
      v.literal("elections"),
      v.literal("governorate_stats")
    ),
    tableName: v.string(),
    fieldName: v.optional(v.string()),
    proposedValue: v.optional(v.string()),
    currentValue: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourceType: v.union(
      v.literal("gov_eg"),
      v.literal("international_org"),
      v.literal("media"),
      v.literal("other")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("needs_human_review")
    ),
    finalConfidence: v.optional(
      v.union(v.literal("high"), v.literal("medium"), v.literal("low"))
    ),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_triggerType", ["triggerType"])
    .index("by_createdAt", ["createdAt"])
    .index("by_category", ["category"]),

  councilVotes: defineTable({
    sessionId: v.id("councilSessions"),
    model: v.string(),
    provider: v.string(),
    vote: v.union(
      v.literal("approve"),
      v.literal("reject"),
      v.literal("abstain")
    ),
    confidence: v.union(
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    reasoning: v.string(),
    sourceVerified: v.boolean(),
    votedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_model", ["model"]),

  // GITHUB ISSUE PROCESSING — batch tracking, dedup, spam prevention
  githubIssueProcessing: defineTable({
    issueNumber: v.number(),
    issueType: v.union(
      v.literal("data"),
      v.literal("ui"),
      v.literal("unknown")
    ),
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("council_review"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("applied"),
      v.literal("spam")
    ),
    councilSessionId: v.optional(v.id("councilSessions")),
    parsedCategory: v.optional(v.string()),
    parsedDataPoint: v.optional(v.string()),
    parsedSourceUrl: v.optional(v.string()),
    authorUsername: v.string(),
    authorAccountAge: v.optional(v.number()),
    duplicateOfIssue: v.optional(v.number()),
    batchId: v.optional(v.string()),
    processedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_issueNumber", ["issueNumber"])
    .index("by_status", ["status"])
    .index("by_batchId", ["batchId"])
    .index("by_authorUsername", ["authorUsername"]),

  // FUNDING — GitHub Sponsors donations + transparent allocation tracking
  fundingDonations: defineTable({
    donorName: v.optional(v.string()),
    isAnonymous: v.boolean(),
    amount: v.number(),
    currency: v.string(),
    amountUsd: v.number(),
    paymentProvider: v.union(
      v.literal("github_sponsors"),
      v.literal("stripe"),
      v.literal("other")
    ),
    externalTransactionId: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("refunded")
    ),
    messageEn: v.optional(v.string()),
    messageAr: v.optional(v.string()),
    confirmedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_createdAt", ["createdAt"])
    .index("by_paymentProvider", ["paymentProvider"]),

  fundingAllocations: defineTable({
    categoryEn: v.string(),
    categoryAr: v.string(),
    category: v.union(
      v.literal("infrastructure"),
      v.literal("ai_api_costs"),
      v.literal("development"),
      v.literal("data_acquisition"),
      v.literal("other")
    ),
    amount: v.number(),
    currency: v.string(),
    amountUsd: v.number(),
    descriptionEn: v.string(),
    descriptionAr: v.string(),
    receiptUrl: v.optional(v.string()),
    vendor: v.optional(v.string()),
    isRecurring: v.boolean(),
    periodStart: v.string(),
    periodEnd: v.string(),
    createdAt: v.number(),
  })
    .index("by_category", ["category"])
    .index("by_createdAt", ["createdAt"]),

  fundingSummary: defineTable({
    month: v.string(),
    totalDonationsUsd: v.number(),
    totalAllocatedUsd: v.number(),
    balanceUsd: v.number(),
    infrastructureCostUsd: v.number(),
    aiApiCostUsd: v.number(),
    developmentCostUsd: v.number(),
    dataCostUsd: v.number(),
    otherCostUsd: v.number(),
    updatedAt: v.number(),
  })
    .index("by_month", ["month"]),

  // SOVEREIGN CREDIT RATINGS (S&P, Moody's, Fitch)
  sovereignRatings: defineTable({
    agency: v.string(),           // "S&P", "Moody's", "Fitch"
    rating: v.string(),           // "B-", "Caa1", "B-"
    outlook: v.string(),          // "Stable", "Positive", "Stable"
    effectiveDate: v.string(),    // ISO date
    previousRating: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sanadLevel: v.number(),
  })
    .index("by_agency", ["agency"]),

  // DAILY POLLS — AI-generated anonymous opinion polls
  polls: defineTable({
    questionAr: v.string(),
    questionEn: v.string(),
    options: v.array(v.object({
      labelAr: v.string(),
      labelEn: v.string(),
      votes: v.number(),
    })),
    category: v.union(
      v.literal("economy"),
      v.literal("budget"),
      v.literal("debt"),
      v.literal("parliament"),
      v.literal("government"),
      v.literal("constitution"),
      v.literal("general")
    ),
    contextAr: v.optional(v.string()),
    contextEn: v.optional(v.string()),
    dataNuggets: v.optional(v.array(v.object({
      labelAr: v.string(),
      labelEn: v.string(),
      value: v.string(),
      linkPath: v.optional(v.string()),
    }))),
    totalVotes: v.number(),
    isActive: v.boolean(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_isActive", ["isActive"])
    .index("by_isActive_and_expiresAt", ["isActive", "expiresAt"])
    .index("by_createdAt", ["createdAt"]),

  pollVotes: defineTable({
    pollId: v.id("polls"),
    optionIndex: v.number(),
    visitorHash: v.string(),
    votedAt: v.number(),
  })
    .index("by_pollId", ["pollId"])
    .index("by_pollId_and_visitorHash", ["pollId", "visitorHash"]),

  // API USAGE TRACKING (real-time token + cost logging)
  apiUsageLog: defineTable({
    provider: v.string(),
    model: v.string(),
    purpose: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
    costUsd: v.number(),
    durationMs: v.number(),
    success: v.boolean(),
    timestamp: v.number(),
  })
    .index("by_provider", ["provider"])
    .index("by_timestamp", ["timestamp"])
    .index("by_purpose", ["purpose"]),

  // PIPELINE PROGRESS — real-time tracking of AI data refresh runs
  pipelineProgress: defineTable({
    runId: v.string(),
    step: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("success"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    message: v.optional(v.string()),
    messageAr: v.optional(v.string()),
    recordsUpdated: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_runId", ["runId"])
    .index("by_runId_and_step", ["runId", "step"]),

  // INVESTMENT OPPORTUNITIES (IDA + GAFI, refreshed every 12h)
  investmentOpportunities: defineTable({
    externalId: v.string(), // unique slug from source
    source: v.union(v.literal("ida"), v.literal("gafi")),
    nameAr: v.string(),
    nameEn: v.string(),
    descriptionAr: v.optional(v.string()),
    descriptionEn: v.optional(v.string()),
    sector: v.string(), // normalized key: "food_processing", "chemicals", etc.
    sectorAr: v.optional(v.string()),
    sectorEn: v.optional(v.string()),
    governorate: v.optional(v.string()), // English name
    governorateAr: v.optional(v.string()),
    type: v.union(
      v.literal("industrial_unit"),
      v.literal("land_plot"),
      v.literal("major_opportunity"),
      v.literal("free_zone"),
      v.literal("investment_zone"),
      v.literal("sme_program")
    ),
    costEgp: v.optional(v.number()),
    costUsd: v.optional(v.number()),
    unitAreaSqm: v.optional(v.number()),
    landAreaSqm: v.optional(v.number()),
    pricePerSqmEgp: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("available"),
        v.literal("under_development"),
        v.literal("reserved"),
        v.literal("unknown")
      )
    ),
    sourceUrl: v.string(),
    sanadLevel: v.number(), // 1=official_gov
    lastScrapedAt: v.number(),
  })
    .index("by_source_and_externalId", ["source", "externalId"])
    .index("by_sector", ["sector"])
    .index("by_governorate", ["governorate"])
    .index("by_type", ["type"])
    .index("by_source", ["source"])
    .index("by_costEgp", ["costEgp"])
    .searchIndex("search_opportunities", {
      searchField: "nameEn",
      filterFields: ["sector", "governorate", "type", "source"],
    }),

  // INVESTMENT PROJECT DETAILS (cost breakdown, 1:1 with investmentOpportunities)
  investmentProjectDetails: defineTable({
    opportunityId: v.id("investmentOpportunities"),
    landCostEgp: v.optional(v.number()),
    constructionCostEgp: v.optional(v.number()),
    equipmentCostEgp: v.optional(v.number()),
    laborCostEgp: v.optional(v.number()), // annual estimate
    licensingFeesEgp: v.optional(v.number()),
    workingCapitalEgp: v.optional(v.number()),
    expectedRevenueEgp: v.optional(v.number()), // annual
    expectedProfitMarginPct: v.optional(v.number()),
    paybackPeriodYears: v.optional(v.number()),
    employeesNeeded: v.optional(v.number()),
    incentivesAr: v.optional(v.string()),
    incentivesEn: v.optional(v.string()),
    licensingStepsAr: v.optional(v.string()), // JSON string of step array
    licensingStepsEn: v.optional(v.string()),
    rawDataJson: v.optional(v.string()), // full scraped data for audit
    sourceUrl: v.string(),
    sanadLevel: v.number(),
  })
    .index("by_opportunityId", ["opportunityId"]),

  // NEWS HEADLINES (GDELT cache)
  newsHeadlines: defineTable({
    title: v.string(),
    url: v.string(),
    sourceDomain: v.string(),
    language: v.string(),
    publishedAt: v.number(),
    imageUrl: v.optional(v.string()),
    fetchedAt: v.number(),
  })
    .index("by_publishedAt", ["publishedAt"])
    .index("by_url", ["url"]),

  // GUIDE CHAT USAGE (analytics + $20/month cost cap)
  chatUsage: defineTable({
    userId: v.optional(v.string()),
    threadId: v.string(),
    model: v.string(),
    provider: v.string(),
    promptTokens: v.number(),
    completionTokens: v.number(),
    totalTokens: v.number(),
    costUsd: v.number(),
    timestamp: v.number(),
  })
    .index("by_timestamp", ["timestamp"])
    .index("by_threadId", ["threadId"])
    .index("by_userId", ["userId"]),

  guideMessages: defineTable({
    threadId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
    actions: v.optional(v.array(guideAction)),
    createdAt: v.number(),
  })
    .index("by_threadId_createdAt", ["threadId", "createdAt"]),
});
