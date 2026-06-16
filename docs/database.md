# Mizan Database Documentation

> Convex serverless database — 40 tables, real-time subscriptions, automatic indexing.

See [database-erd.md](./database-erd.md) for the visual entity relationship diagram.

---

## Table of Contents

1. [Government Hierarchy](#government-hierarchy) (3 tables)
2. [Parliament](#parliament) (4 tables)
3. [Constitution](#constitution) (3 tables)
4. [Budget & Spending](#budget--spending) (2 tables)
5. [National Debt](#national-debt) (2 tables)
6. [Elections](#elections) (3 tables)
7. [Economic Data](#economic-data) (5 tables)
8. [Investment](#investment) (2 tables)
9. [News](#news) (1 table)
10. [AI Pipeline & Audit](#ai-pipeline--audit) (5 tables)
11. [LLM Council](#llm-council) (3 tables)
12. [Polls](#polls) (2 tables)
13. [Funding](#funding) (3 tables)
14. [System](#system) (2 tables)

---

## Sanad Level (سند)

Every data table includes a `sanadLevel` field (1-5) indicating source confidence:

| Level | Name | Description |
|-------|------|-------------|
| 1 | Official Government | Direct from .gov.eg (CAPMAS, ministries) |
| 2 | International Org | World Bank, IMF, UNDP |
| 3 | News & Media | Ahram Online, SIS |
| 4 | Other Sources | Wikipedia, community |
| 5 | Derived/Calculated | Computed from other data |

---

## Government Hierarchy

### `officials`
Central table for all government officials (president, ministers, governors, MPs, senators).

| Field | Type | Notes |
|-------|------|-------|
| nameAr, nameEn | string | Bilingual name |
| titleAr, titleEn | string | Official title |
| role | enum | president, prime_minister, minister, deputy_minister, governor, mp, senator, speaker, other |
| isCurrent | boolean | Active in office |
| appointmentDate | string? | ISO date |
| endDate | string? | When left office |
| photoUrl | string? | Portrait URL |
| bioAr, bioEn | string? | Biography |
| sourceUrl | string? | Where data was obtained |
| sanadLevel | number | 1-5 confidence |

**Indexes:** `by_role`, `by_isCurrent`, `by_role_and_isCurrent`

**Referenced by:** ministries, governorates, parliamentMembers, committees

---

### `ministries`
Government ministries with hierarchical structure.

| Field | Type | Notes |
|-------|------|-------|
| nameAr, nameEn | string | Ministry name |
| mandateAr, mandateEn | string? | Ministry mandate/mission |
| currentMinisterId | id(officials)? | Current minister |
| parentMinistryId | id(ministries)? | Parent ministry (self-ref) |
| websiteUrl | string? | Ministry website URL |
| employeeCount | number? | Staff size |
| establishedYear | number? | Year ministry was established |
| sector | enum? | sovereignty, economic, social, infrastructure |
| sortOrder | number | Display order |

**Indexes:** `by_sortOrder`, `by_sector`

---

### `governorates`
Egypt's 27 governorates.

| Field | Type | Notes |
|-------|------|-------|
| nameAr, nameEn | string | Governorate name |
| capitalAr, capitalEn | string | Capital city |
| currentGovernorId | id(officials)? | Current governor |
| population | number? | Population count |
| area | number? | Area in km2 |
| isCity | boolean | City-governorate (Cairo, Alex) |
| geoJsonId | string? | Map rendering key |
| regionAr, regionEn | string? | Geographic region |

**Indexes:** `by_nameEn`, `by_regionEn`

---

## Parliament

### `parties`
Political parties represented in parliament.

| Field | Type | Notes |
|-------|------|-------|
| nameAr, nameEn | string | Party name |
| abbreviation | string? | Short form |
| color | string | Hex color for charts |
| logoUrl | string? | Party logo URL |
| foundedYear | number? | Year established |
| ideology | string? | Political orientation |
| websiteUrl | string? | Party website URL |

**Indexes:** `by_nameEn`

---

### `parliamentMembers`
Individual MPs and senators linked to officials, parties, and governorates.

| Field | Type | Notes |
|-------|------|-------|
| officialId | id(officials) | The person |
| chamber | enum | house, senate |
| partyId | id(parties)? | Party affiliation |
| governorateId | id(governorates)? | Representing governorate |
| electionMethod | enum | constituency, party_list, presidential_appointment |
| constituency | string? | Constituency name |
| termStart | string | Term start date |
| termEnd | string? | Term end date |
| isCurrent | boolean | Currently serving |
| seatNumber | number? | Assigned seat number |
| campaignFinanceAr, campaignFinanceEn | string? | Campaign finance info |
| websiteUrl | string? | Member website URL |
| phoneNumber | string? | Contact phone number |

**Indexes:** `by_chamber`, `by_chamber_and_isCurrent`, `by_partyId`, `by_governorateId`

---

### `committees`
Parliamentary committees (House and Senate).

| Field | Type | Notes |
|-------|------|-------|
| nameAr, nameEn | string | Committee name |
| chamber | enum | house, senate |
| descriptionAr, descriptionEn | string? | Committee description |
| chairpersonId | id(officials)? | Committee chairperson |
| type | enum | standing, special, general, ethics |

**Indexes:** `by_chamber`, `by_chamber_and_type`

### `committeeMemberships`
Junction table linking parliamentMembers to committees with role (chair, vice_chair, member).

| Field | Type | Notes |
|-------|------|-------|
| committeeId | id(committees) | The committee |
| memberId | id(parliamentMembers) | The member |
| role | enum | chair, vice_chair, member |

**Indexes:** `by_committeeId`, `by_memberId`

---

## Constitution

### `constitutionParts`
Major divisions of the 2014 constitution (preamble, chapters).

| Field | Type | Notes |
|-------|------|-------|
| partNumber | number | Part number |
| titleAr, titleEn | string | Part title |
| sortOrder | number | Display order |

**Indexes:** `by_sortOrder`

### `constitutionArticles`
All 247 articles with full Arabic/English text, amendment tracking, and full-text search.

| Field | Type | Notes |
|-------|------|-------|
| articleNumber | number | Article number |
| partId | id(constitutionParts) | Parent part |
| textAr, textEn | string | Full article text |
| summaryAr, summaryEn | string? | Article summary |
| wasAmended2019 | boolean | Amended in 2019 |
| originalTextAr, originalTextEn | string? | Pre-amendment text |
| keywords | string[] | Keyword tags |

**Indexes:** `by_articleNumber`, `by_partId`, `by_wasAmended2019`

**Search Index:** `search_articles` on `textEn` field, filterable by `partId` and `wasAmended2019`.

### `articleCrossReferences`
Relationships between articles (references, amends, contradicts, elaborates).

| Field | Type | Notes |
|-------|------|-------|
| fromArticleId | id(constitutionArticles) | Source article |
| toArticleId | id(constitutionArticles) | Target article |
| relationshipType | enum | references, amends, contradicts, elaborates |
| noteEn | string? | English note |
| noteAr | string? | Arabic note |

**Indexes:** `by_fromArticleId`, `by_toArticleId`

---

## Budget & Spending

### `fiscalYears`
Annual budget records with revenue, expenditure, deficit, GDP.

| Field | Type | Notes |
|-------|------|-------|
| year | string | e.g. "2024-2025" |
| startDate | string | Fiscal year start |
| endDate | string | Fiscal year end |
| totalRevenue | number? | Total revenue |
| totalExpenditure | number? | Total expenditure |
| deficit | number? | Budget deficit |
| gdp | number? | GDP for that year |
| sourceUrl | string? | Data source URL |
| sanadLevel | number | 1-5 confidence |

**Indexes:** `by_year`

### `budgetItems`
Hierarchical budget line items (self-referential via `parentItemId`). Each linked to a fiscal year, categorized as revenue or expenditure.

| Field | Type | Notes |
|-------|------|-------|
| fiscalYearId | id(fiscalYears) | Parent fiscal year |
| category | enum | revenue, expenditure |
| sectorAr, sectorEn | string | Sector name |
| parentItemId | id(budgetItems)? | Parent item (self-ref) |
| amount | number | Amount in EGP |
| percentageOfTotal | number? | % of total budget |
| percentageOfGdp | number? | % of GDP |
| sourceUrl | string? | Data source URL |
| sanadLevel | number | 1-5 confidence |

**Indexes:** `by_fiscalYearId`, `by_fiscalYearId_and_category`, `by_parentItemId`

---

## National Debt

### `debtRecords`
Time-series debt data: external debt, domestic debt, debt-to-GDP ratio, reserves, debt service.

| Field | Type | Notes |
|-------|------|-------|
| date | string | ISO date |
| totalExternalDebt | number? | External debt |
| totalDomesticDebt | number? | Domestic debt |
| debtToGdpRatio | number? | Debt-to-GDP ratio |
| foreignReserves | number? | Foreign reserves |
| totalDebtService | number? | Total debt service |
| totalInterestPayments | number? | Interest payments |
| sourceUrl | string? | Data source URL |
| sourceNameEn | string? | Source name |
| sanadLevel | number | 1-5 confidence |

**Indexes:** `by_date`

### `debtByCreditor`
Breakdown of debt by creditor (multilateral, bilateral, commercial) with interest rates and maturity terms.

| Field | Type | Notes |
|-------|------|-------|
| debtRecordId | id(debtRecords) | Parent debt record |
| creditorAr | string | Creditor name (Arabic) |
| creditorEn | string | Creditor name (English) |
| creditorType | enum | multilateral, bilateral, commercial, other |
| amount | number | Debt amount |
| percentageOfTotal | number? | % of total debt |
| interestRate | number? | Interest rate |
| annualDebtService | number? | Annual debt service |
| maturityYears | number? | Maturity in years |
| termsNoteEn | string? | Terms note (English) |
| termsNoteAr | string? | Terms note (Arabic) |
| sourceUrl | string? | Data source URL |

**Indexes:** `by_debtRecordId`, `by_creditorType`

---

## Elections

### `elections`
Presidential, parliamentary, and referendum records.

| Field | Type | Notes |
|-------|------|-------|
| type | enum | presidential, parliamentary_house, parliamentary_senate, referendum |
| year | number | Election year |
| dateHeld | string | Date of election |
| totalRegisteredVoters | number? | Registered voters |
| totalVotesCast | number? | Total votes cast |
| turnoutPercentage | number? | Voter turnout % |
| sourceUrl | string? | Data source URL |
| sanadLevel | number | 1-5 confidence |

**Indexes:** `by_type`, `by_year`, `by_type_and_year`

### `electionResults`
Per-candidate results with vote counts and winner flag.

| Field | Type | Notes |
|-------|------|-------|
| electionId | id(elections) | Parent election |
| candidateNameAr | string | Candidate name (Arabic) |
| candidateNameEn | string | Candidate name (English) |
| partyId | id(parties)? | Party affiliation |
| votes | number | Vote count |
| percentage | number | Vote percentage |
| isWinner | boolean | Won the election |
| sourceUrl | string? | Data source URL |
| sanadLevel | number | 1-5 confidence |

**Indexes:** `by_electionId`

### `governorateElectionData`
Governorate-level election data: turnout, winner, vote percentages. Links elections to governorates.

| Field | Type | Notes |
|-------|------|-------|
| electionId | id(elections) | Parent election |
| governorateId | id(governorates) | Governorate |
| registeredVoters | number? | Registered voters |
| votesCast | number? | Votes cast |
| turnoutPercentage | number? | Turnout % |
| winnerNameAr | string? | Winner name (Arabic) |
| winnerNameEn | string? | Winner name (English) |
| winnerVotes | number? | Winner vote count |
| winnerPercentage | number? | Winner vote % |

**Indexes:** `by_electionId`, `by_governorateId`, `by_electionId_and_governorateId`

---

## Economic Data

### `economicIndicators`
Time-series economic data (GDP growth, inflation, unemployment, exchange rate, reserves, remittances, FDI, tourism, stock market, etc.). **Supports multi-source** — multiple records per indicator+date from different sources.

| Field | Type | Notes |
|-------|------|-------|
| indicator | string | Indicator key |
| year | string? | Year (optional) |
| date | string | ISO date |
| value | number | Indicator value |
| unit | string | Unit of measure |
| sourceUrl | string? | Data source URL |
| sourceNameEn | string? | Source name |
| sanadLevel | number | 1-5 confidence |

**Key indicators:** `gdp_growth`, `inflation`, `unemployment`, `exchange_rate`, `reserves`, `remittances`, `fdi_inflows`, `tourism_receipts`, `current_account`, `egx30`, `egx30_annual_return`, `banque_misr_cd_1yr`, `nbe_cd_3yr`, `egypt_tbill_rate`, `gold_annual_return`, `sp500_annual_return`, etc.

**Indexes:** `by_indicator`, `by_indicator_and_date`

### `governorateStats`
Per-governorate statistics (population, area, density, HDI). Multi-source with Sanad levels.

| Field | Type | Notes |
|-------|------|-------|
| governorateId | id(governorates) | Parent governorate |
| indicator | string | e.g. "population", "area_km2", "density_per_km2", "hdi" |
| year | string | e.g. "2023" |
| value | number | Statistic value |
| unit | string | e.g. "people", "km2", "per_km2", "index" |
| sourceUrl | string | Data source URL |
| sourceNameEn | string? | Source name (English) |
| sourceNameAr | string? | Source name (Arabic) |
| sanadLevel | number | 1-5 confidence |

**Indexes:** `by_governorateId`, `by_governorateId_and_indicator`, `by_indicator_and_year`, `by_governorateId_indicator_year`

### `taxBrackets`
Egyptian income tax brackets by year.

| Field | Type | Notes |
|-------|------|-------|
| year | string | Tax year |
| fromAmount | number | Bracket lower bound |
| toAmount | number? | Bracket upper bound (null = unlimited) |
| rate | number | Tax rate |
| personalExemption | number? | Personal exemption amount |
| lawReference | string? | Relevant law reference |
| sourceUrl | string? | Data source URL |
| sortOrder | number | Display order |
| sanadLevel | number | 1-5 confidence |

**Indexes:** `by_year`, `by_year_and_sortOrder`

### `sovereignRatings`
Credit ratings from S&P, Moody's, and Fitch.

| Field | Type | Notes |
|-------|------|-------|
| agency | string | e.g. "S&P", "Moody's", "Fitch" |
| rating | string | e.g. "B-", "Caa1" |
| outlook | string | e.g. "Stable", "Positive" |
| effectiveDate | string | ISO date |
| previousRating | string? | Previous rating |
| sourceUrl | string? | Data source URL |
| sanadLevel | number | 1-5 confidence |

**Indexes:** `by_agency`

### `dataSources`
Registry of all data sources used by the pipeline. Category-tagged, with Sanad levels.

| Field | Type | Notes |
|-------|------|-------|
| nameAr, nameEn | string | Source name |
| url | string | Source URL |
| type | enum | official_government, international_org, academic, media, other |
| lastAccessedDate | string | Last access date |
| notes | string? | Additional notes |
| category | enum? | government, parliament, constitution, budget, debt, elections, economy, governorate_stats, industry, general |
| sanadLevel | number | 1-5 confidence |

**Indexes:** `by_type`, `by_category`, `by_url`

---

## Investment

### `investmentOpportunities`
Investment opportunities from IDA and GAFI, refreshed every 12h.

| Field | Type | Notes |
|-------|------|-------|
| externalId | string | Unique slug from source |
| source | enum | ida, gafi |
| nameAr, nameEn | string | Opportunity name |
| descriptionAr, descriptionEn | string? | Description |
| sector | string | Normalized key e.g. "food_processing", "chemicals" |
| sectorAr, sectorEn | string? | Sector display name |
| governorate | string? | English governorate name |
| governorateAr | string? | Arabic governorate name |
| type | enum | industrial_unit, land_plot, major_opportunity, free_zone, investment_zone, sme_program |
| costEgp | number? | Cost in EGP |
| costUsd | number? | Cost in USD |
| unitAreaSqm | number? | Unit area in sqm |
| landAreaSqm | number? | Land area in sqm |
| pricePerSqmEgp | number? | Price per sqm in EGP |
| status | enum? | available, under_development, reserved, unknown |
| sourceUrl | string | Data source URL |
| sanadLevel | number | 1-5 confidence |
| lastScrapedAt | number | Last scrape timestamp |

**Indexes:** `by_source_and_externalId`, `by_sector`, `by_governorate`, `by_type`, `by_source`, `by_costEgp`

**Search Index:** `search_opportunities` on `nameEn` field, filterable by `sector`, `governorate`, `type`, `source`.

### `investmentProjectDetails`
Detailed cost breakdown for investment opportunities (1:1 with investmentOpportunities).

| Field | Type | Notes |
|-------|------|-------|
| opportunityId | id(investmentOpportunities) | Parent opportunity |
| landCostEgp | number? | Land cost |
| constructionCostEgp | number? | Construction cost |
| equipmentCostEgp | number? | Equipment cost |
| laborCostEgp | number? | Annual labor cost estimate |
| licensingFeesEgp | number? | Licensing fees |
| workingCapitalEgp | number? | Working capital |
| expectedRevenueEgp | number? | Expected annual revenue |
| expectedProfitMarginPct | number? | Expected profit margin % |
| paybackPeriodYears | number? | Payback period in years |
| employeesNeeded | number? | Number of employees needed |
| incentivesAr, incentivesEn | string? | Available incentives |
| licensingStepsAr, licensingStepsEn | string? | Licensing steps (JSON string) |
| rawDataJson | string? | Full scraped data for audit |
| sourceUrl | string | Data source URL |
| sanadLevel | number | 1-5 confidence |

**Indexes:** `by_opportunityId`

---

## News

### `newsHeadlines`
Cached news headlines from GDELT.

| Field | Type | Notes |
|-------|------|-------|
| title | string | Headline text |
| url | string | Article URL |
| sourceDomain | string | Source domain |
| language | string | Language code |
| publishedAt | number | Publish timestamp |
| imageUrl | string? | Image URL |
| fetchedAt | number | Fetch timestamp |

**Indexes:** `by_publishedAt`, `by_url`

---

## AI Pipeline & Audit

### `dataRefreshLog`
Audit trail of every pipeline run — category, status, records updated, timestamps.

| Field | Type | Notes |
|-------|------|-------|
| category | enum | government, parliament, constitution, budget, debt, economy, governorate_stats, industry, all |
| status | enum | success, failed, in_progress |
| recordsUpdated | number? | Records updated |
| sourceUrl | string? | Source URL |
| errorMessage | string? | Error message (on failure) |
| startedAt | number | Start timestamp |
| completedAt | number? | Completion timestamp |
| isCompacted | boolean? | Marked as weekly summary by maintenance compaction |

**Indexes:** `by_category`, `by_category_and_startedAt`, `by_category_and_status_and_startedAt`

### `dataChangeLog`
Granular per-operation log — what the AI agent created, updated, validated, or flagged.

| Field | Type | Notes |
|-------|------|-------|
| refreshLogId | id(dataRefreshLog) | Parent refresh log |
| category | enum | government, parliament, constitution, budget, debt, elections, economy, governorate_stats, industry |
| action | enum | created, updated, validated, flagged, no_change |
| tableName | string | Target table |
| recordId | string? | Target record ID |
| descriptionAr, descriptionEn | string | Change description |
| previousValue | string? | Previous value |
| newValue | string? | New value |
| sourceUrl | string? | Source URL |
| timestamp | number | Change timestamp |

**Indexes:** `by_category`, `by_refreshLogId`, `by_timestamp`

### `dataLineage`
Provenance tracking for individual data points — source type, confidence, AI verification status.

| Field | Type | Notes |
|-------|------|-------|
| tableName | string | Table name |
| fieldName | string | Field name |
| recordId | string? | Record ID |
| value | string | Data value |
| sourceType | enum | direct, calculated, estimated, ai_extracted, manual |
| sourceUrl | string? | Source URL |
| sourceNameAr, sourceNameEn | string? | Source name |
| accessDate | string | Date data was accessed |
| derivationMethod | string? | How value was derived |
| derivationInputs | string[]? | Input values for derivation |
| confidence | enum | high, medium, low |
| aiVerified | boolean | Verified by AI |
| aiVerificationNote | string? | AI verification note |
| lastUpdated | number | Last update timestamp |

**Indexes:** `by_tableName`, `by_tableName_and_fieldName`, `by_tableName_and_recordId`, `by_lastUpdated`

### `aiResearchReports`
AI-generated verification reports (e.g., "External Debt Verification") with findings and discrepancy counts.

| Field | Type | Notes |
|-------|------|-------|
| titleAr, titleEn | string | Report title |
| category | enum | government, parliament, constitution, budget, debt, elections, economy, governorate_stats, industry |
| summaryAr, summaryEn | string | Report summary |
| contentAr, contentEn | string | Full report content |
| sourcesChecked | array | Array of {nameEn, url, accessible} |
| findingsCount | number | Number of findings |
| discrepanciesFound | number | Number of discrepancies |
| generatedAt | number | Generation timestamp |
| agentModel | string | AI model used |

**Indexes:** `by_category`, `by_generatedAt`

### `pipelineProgress`
Real-time tracking of pipeline runs — each step (government, parliament, budget, debt, economy, governorate_stats, constitution, etc.) with status.

| Field | Type | Notes |
|-------|------|-------|
| runId | string | Run identifier |
| step | string | Pipeline step name |
| status | enum | pending, running, success, failed, skipped |
| message | string? | Status message (English) |
| messageAr | string? | Status message (Arabic) |
| recordsUpdated | number? | Records updated in this step |
| startedAt | number? | Step start timestamp |
| completedAt | number? | Step completion timestamp |
| error | string? | Error message |

**Indexes:** `by_runId`, `by_runId_and_step`

---

## LLM Council

### `councilSessions`
Multi-model voting sessions for data verification. Triggered by GitHub issues, data refreshes, or manual review.

| Field | Type | Notes |
|-------|------|-------|
| triggerType | enum | github_issue, data_refresh, manual |
| triggerRef | string | Reference to trigger (e.g. issue number) |
| category | enum | government, parliament, constitution, budget, debt, elections, governorate_stats |
| tableName | string | Target table |
| fieldName | string? | Target field |
| proposedValue | string? | Proposed new value |
| currentValue | string? | Current value |
| sourceUrl | string? | Source URL |
| sourceType | enum | gov_eg, international_org, media, other |
| status | enum | pending, approved, rejected, needs_human_review |
| finalConfidence | enum? | high, medium, low |
| resolvedAt | number? | Resolution timestamp |
| resolvedBy | string? | Who resolved it |
| createdAt | number | Creation timestamp |

**Indexes:** `by_status`, `by_triggerType`, `by_createdAt`, `by_category`

### `councilVotes`
Individual model votes (approve/reject/abstain) with confidence and reasoning.

| Field | Type | Notes |
|-------|------|-------|
| sessionId | id(councilSessions) | Parent session |
| model | string | Model name |
| provider | string | Provider name |
| vote | enum | approve, reject, abstain |
| confidence | enum | high, medium, low |
| reasoning | string | Vote reasoning |
| sourceVerified | boolean | Whether source was verified |
| votedAt | number | Vote timestamp |

**Indexes:** `by_sessionId`, `by_model`

### `githubIssueProcessing`
Tracks community-submitted data corrections from GitHub Issues through the LLM Council pipeline.

| Field | Type | Notes |
|-------|------|-------|
| issueNumber | number | GitHub issue number |
| issueType | enum | data, ui, unknown |
| status | enum | queued, processing, council_review, approved, rejected, applied, spam |
| councilSessionId | id(councilSessions)? | Linked council session |
| parsedCategory | string? | Parsed data category |
| parsedDataPoint | string? | Parsed data point |
| parsedSourceUrl | string? | Parsed source URL |
| authorUsername | string | Issue author username |
| authorAccountAge | number? | Author account age |
| duplicateOfIssue | number? | Duplicate issue number |
| batchId | string? | Processing batch ID |
| processedAt | number? | Processing timestamp |
| createdAt | number | Creation timestamp |

**Indexes:** `by_issueNumber`, `by_status`, `by_batchId`, `by_authorUsername`

---

## Polls

### `polls`
AI-generated weekly polls with bilingual questions, category tagging, data nuggets, and vote tracking.

| Field | Type | Notes |
|-------|------|-------|
| questionAr, questionEn | string | Poll question |
| options | array | Array of {labelAr, labelEn, votes} |
| category | enum | economy, budget, debt, parliament, government, constitution, general |
| contextAr, contextEn | string? | Context for the poll |
| dataNuggets | array? | Array of {labelAr, labelEn, value, linkPath?} |
| totalVotes | number | Total vote count |
| isActive | boolean | Currently active |
| expiresAt | number | Expiry timestamp |
| createdAt | number | Creation timestamp |

**Indexes:** `by_isActive`, `by_isActive_and_expiresAt`, `by_createdAt`

### `pollVotes`
Individual anonymous votes linked by visitor hash (localStorage-based, no accounts).

| Field | Type | Notes |
|-------|------|-------|
| pollId | id(polls) | Parent poll |
| optionIndex | number | Selected option index |
| visitorHash | string | Anonymous visitor hash |
| votedAt | number | Vote timestamp |

**Indexes:** `by_pollId`, `by_pollId_and_visitorHash`

---

## Funding

### `fundingDonations`
Individual donations via GitHub Sponsors or Stripe.

| Field | Type | Notes |
|-------|------|-------|
| donorName | string? | Donor name |
| isAnonymous | boolean | Anonymous donation |
| amount | number | Donation amount |
| currency | string | Currency code |
| amountUsd | number | Amount in USD |
| paymentProvider | enum | github_sponsors, stripe, other |
| externalTransactionId | string? | External transaction ID |
| status | enum | pending, confirmed, refunded |
| messageEn | string? | Donor message (English) |
| messageAr | string? | Donor message (Arabic) |
| confirmedAt | number? | Confirmation timestamp |
| createdAt | number | Creation timestamp |

**Indexes:** `by_status`, `by_createdAt`, `by_paymentProvider`

### `fundingAllocations`
Where money goes — infrastructure, AI API costs, development, data acquisition.

| Field | Type | Notes |
|-------|------|-------|
| categoryEn | string | Category name (English) |
| categoryAr | string | Category name (Arabic) |
| category | enum | infrastructure, ai_api_costs, development, data_acquisition, other |
| amount | number | Allocation amount |
| currency | string | Currency code |
| amountUsd | number | Amount in USD |
| descriptionEn, descriptionAr | string | Description |
| receiptUrl | string? | Receipt URL |
| vendor | string? | Vendor name |
| isRecurring | boolean | Recurring allocation |
| periodStart | string | Period start date |
| periodEnd | string | Period end date |
| createdAt | number | Creation timestamp |

**Indexes:** `by_category`, `by_createdAt`

### `fundingSummary`
Monthly rollup of donations vs. allocations with running balance.

| Field | Type | Notes |
|-------|------|-------|
| month | string | Month (e.g. "2024-01") |
| totalDonationsUsd | number | Total donations |
| totalAllocatedUsd | number | Total allocated |
| balanceUsd | number | Running balance |
| infrastructureCostUsd | number | Infrastructure costs |
| aiApiCostUsd | number | AI API costs |
| developmentCostUsd | number | Development costs |
| dataCostUsd | number | Data acquisition costs |
| otherCostUsd | number | Other costs |
| updatedAt | number | Last update timestamp |

**Indexes:** `by_month`

---

## System

### `apiUsageLog`
Tracks AI API usage (tokens, cost, duration) per provider and purpose.

| Field | Type | Notes |
|-------|------|-------|
| provider | string | API provider |
| model | string | Model name |
| purpose | string | Usage purpose |
| inputTokens | number | Input tokens |
| outputTokens | number | Output tokens |
| totalTokens | number | Total tokens |
| costUsd | number | Cost in USD |
| durationMs | number | Duration in milliseconds |
| success | boolean | Request succeeded |
| timestamp | number | Timestamp |

**Indexes:** `by_provider`, `by_timestamp`, `by_purpose`

### `chatUsage`
Guide chat analytics and cost tracking ($20/month cost cap).

| Field | Type | Notes |
|-------|------|-------|
| userId | string? | User identifier |
| threadId | string | Chat thread ID |
| model | string | Model name |
| provider | string | Provider name |
| promptTokens | number | Prompt tokens |
| completionTokens | number | Completion tokens |
| totalTokens | number | Total tokens |
| costUsd | number | Cost in USD |
| timestamp | number | Timestamp |

**Indexes:** `by_timestamp`, `by_threadId`, `by_userId`

---

## Key Relationships Summary

```
officials ←── ministries (currentMinisterId)
officials ←── governorates (currentGovernorId)
officials ←── parliamentMembers (officialId)
officials ←── committees (chairpersonId)

parties ←── parliamentMembers (partyId)
parties ←── electionResults (partyId)

governorates ←── parliamentMembers (governorateId)
governorates ←── governorateElectionData (governorateId)
governorates ←── governorateStats (governorateId)

elections ←── electionResults (electionId)
elections ←── governorateElectionData (electionId)

fiscalYears ←── budgetItems (fiscalYearId)
debtRecords ←── debtByCreditor (debtRecordId)

constitutionParts ←── constitutionArticles (partId)
constitutionArticles ←── articleCrossReferences (fromArticleId, toArticleId)

committees ←── committeeMemberships (committeeId)
parliamentMembers ←── committeeMemberships (memberId)

investmentOpportunities ←── investmentProjectDetails (opportunityId)

councilSessions ←── councilVotes (sessionId)
councilSessions ←── githubIssueProcessing (councilSessionId)

dataRefreshLog ←── dataChangeLog (refreshLogId)
polls ←── pollVotes (pollId)
```
