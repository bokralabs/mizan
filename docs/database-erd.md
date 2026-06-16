# Mizan Database ERD

## Entity Relationship Diagram

```mermaid
erDiagram
    %% ═══════════════════════════════════════════════
    %% GOVERNMENT HIERARCHY
    %% ═══════════════════════════════════════════════

    officials {
        string nameAr
        string nameEn
        string titleAr
        string titleEn
        string role "president|minister|governor|mp|..."
        boolean isCurrent
        string appointmentDate
        number sanadLevel
    }

    ministries {
        string nameAr
        string nameEn
        string mandateAr "optional"
        string mandateEn "optional"
        string sector "sovereignty|economic|social|infrastructure"
        string websiteUrl "optional"
        number employeeCount "optional"
        number establishedYear "optional"
        number sortOrder
    }

    governorates {
        string nameAr
        string nameEn
        string capitalAr
        string capitalEn
        number population "optional"
        number area "optional"
        boolean isCity
        string geoJsonId "optional"
        string regionAr "optional"
        string regionEn "optional"
    }

    ministries ||--o| officials : "currentMinisterId"
    ministries ||--o| ministries : "parentMinistryId"
    governorates ||--o| officials : "currentGovernorId"

    %% ═══════════════════════════════════════════════
    %% PARLIAMENT
    %% ═══════════════════════════════════════════════

    parties {
        string nameAr
        string nameEn
        string abbreviation "optional"
        string color
        string logoUrl "optional"
        number foundedYear "optional"
        string ideology "optional"
        string websiteUrl "optional"
    }

    parliamentMembers {
        string chamber "house|senate"
        string electionMethod "constituency|party_list|presidential_appointment"
        string constituency "optional"
        string termStart
        string termEnd "optional"
        boolean isCurrent
        number seatNumber "optional"
        string campaignFinanceEn "optional"
        string websiteUrl "optional"
        string phoneNumber "optional"
    }

    committees {
        string nameAr
        string nameEn
        string chamber "house|senate"
        string descriptionAr "optional"
        string descriptionEn "optional"
        string type "standing|special|general|ethics"
    }

    committeeMemberships {
        string role "chair|vice_chair|member"
    }

    parliamentMembers ||--|| officials : "officialId"
    parliamentMembers ||--o| parties : "partyId"
    parliamentMembers ||--o| governorates : "governorateId"
    committees ||--o| officials : "chairpersonId"
    committeeMemberships ||--|| committees : "committeeId"
    committeeMemberships ||--|| parliamentMembers : "memberId"

    %% ═══════════════════════════════════════════════
    %% CONSTITUTION
    %% ═══════════════════════════════════════════════

    constitutionParts {
        number partNumber
        string titleAr
        string titleEn
        number sortOrder
    }

    constitutionArticles {
        number articleNumber
        string textAr
        string textEn
        string summaryAr "optional"
        string summaryEn "optional"
        boolean wasAmended2019
        string originalTextAr "optional"
        string originalTextEn "optional"
        string keywords "array"
    }

    articleCrossReferences {
        string relationshipType "references|amends|contradicts|elaborates"
        string noteEn "optional"
        string noteAr "optional"
    }

    constitutionArticles ||--|| constitutionParts : "partId"
    articleCrossReferences ||--|| constitutionArticles : "fromArticleId"
    articleCrossReferences ||--|| constitutionArticles : "toArticleId"

    %% ═══════════════════════════════════════════════
    %% BUDGET & SPENDING
    %% ═══════════════════════════════════════════════

    fiscalYears {
        string year "e.g. 2024-2025"
        string startDate
        string endDate
        number totalRevenue "optional"
        number totalExpenditure "optional"
        number deficit "optional"
        number gdp "optional"
        string sourceUrl "optional"
        number sanadLevel
    }

    budgetItems {
        string category "revenue|expenditure"
        string sectorAr
        string sectorEn
        number amount
        number percentageOfTotal "optional"
        number percentageOfGdp "optional"
        string sourceUrl "optional"
        number sanadLevel
    }

    budgetItems ||--|| fiscalYears : "fiscalYearId"
    budgetItems ||--o| budgetItems : "parentItemId"

    %% ═══════════════════════════════════════════════
    %% NATIONAL DEBT
    %% ═══════════════════════════════════════════════

    debtRecords {
        string date
        number totalExternalDebt "optional"
        number totalDomesticDebt "optional"
        number debtToGdpRatio "optional"
        number foreignReserves "optional"
        number totalDebtService "optional"
        number totalInterestPayments "optional"
        string sourceUrl "optional"
        string sourceNameEn "optional"
        number sanadLevel
    }

    debtByCreditor {
        string creditorAr
        string creditorEn
        string creditorType "multilateral|bilateral|commercial|other"
        number amount
        number percentageOfTotal "optional"
        number interestRate "optional"
        number annualDebtService "optional"
        number maturityYears "optional"
        string termsNoteEn "optional"
        string termsNoteAr "optional"
        string sourceUrl "optional"
    }

    debtByCreditor ||--|| debtRecords : "debtRecordId"

    %% ═══════════════════════════════════════════════
    %% ELECTIONS
    %% ═══════════════════════════════════════════════

    elections {
        string type "presidential|parliamentary_house|parliamentary_senate|referendum"
        number year
        string dateHeld
        number totalRegisteredVoters "optional"
        number totalVotesCast "optional"
        number turnoutPercentage "optional"
        string sourceUrl "optional"
        number sanadLevel
    }

    electionResults {
        string candidateNameAr
        string candidateNameEn
        number votes
        number percentage
        boolean isWinner
        string sourceUrl "optional"
        number sanadLevel
    }

    governorateElectionData {
        number registeredVoters "optional"
        number votesCast "optional"
        number turnoutPercentage "optional"
        string winnerNameAr "optional"
        string winnerNameEn "optional"
        number winnerVotes "optional"
        number winnerPercentage "optional"
    }

    electionResults ||--|| elections : "electionId"
    electionResults ||--o| parties : "partyId"
    governorateElectionData ||--|| elections : "electionId"
    governorateElectionData ||--|| governorates : "governorateId"

    %% ═══════════════════════════════════════════════
    %% DATA & ECONOMICS
    %% ═══════════════════════════════════════════════

    economicIndicators {
        string indicator "gdp_growth|inflation|unemployment|..."
        string year "optional"
        string date
        number value
        string unit
        string sourceUrl "optional"
        string sourceNameEn "optional"
        number sanadLevel
    }

    governorateStats {
        string indicator "population|area_km2|hdi|..."
        string year
        number value
        string unit
        string sourceUrl
        string sourceNameEn "optional"
        string sourceNameAr "optional"
        number sanadLevel
    }

    governorateStats ||--|| governorates : "governorateId"

    taxBrackets {
        string year
        number fromAmount
        number toAmount "optional"
        number rate
        number personalExemption "optional"
        string lawReference "optional"
        string sourceUrl "optional"
        number sortOrder
        number sanadLevel
    }

    sovereignRatings {
        string agency "S&P|Moodys|Fitch"
        string rating
        string outlook
        string effectiveDate
        string previousRating "optional"
        string sourceUrl "optional"
        number sanadLevel
    }

    dataSources {
        string nameAr
        string nameEn
        string url
        string type "official_government|international_org|academic|media|other"
        string lastAccessedDate
        string notes "optional"
        string category "government|parliament|constitution|budget|debt|elections|economy|governorate_stats|industry|general"
        number sanadLevel
    }

    %% ═══════════════════════════════════════════════
    %% AI PIPELINE & AUDIT
    %% ═══════════════════════════════════════════════

    dataRefreshLog {
        string category "government|parliament|constitution|budget|debt|economy|governorate_stats|industry|all"
        string status "success|failed|in_progress"
        number recordsUpdated "optional"
        string sourceUrl "optional"
        string errorMessage "optional"
        number startedAt
        number completedAt "optional"
        boolean isCompacted "optional"
    }

    dataChangeLog {
        string category "government|parliament|constitution|budget|debt|elections|economy|governorate_stats|industry"
        string action "created|updated|validated|flagged|no_change"
        string tableName
        string recordId "optional"
        string descriptionAr
        string descriptionEn
        string previousValue "optional"
        string newValue "optional"
        string sourceUrl "optional"
        number timestamp
    }

    dataChangeLog ||--|| dataRefreshLog : "refreshLogId"

    dataLineage {
        string tableName
        string fieldName
        string recordId "optional"
        string value
        string sourceType "direct|calculated|estimated|ai_extracted|manual"
        string sourceUrl "optional"
        string sourceNameAr "optional"
        string sourceNameEn "optional"
        string accessDate
        string derivationMethod "optional"
        string derivationInputs "optional array"
        string confidence "high|medium|low"
        boolean aiVerified
        string aiVerificationNote "optional"
        number lastUpdated
    }

    aiResearchReports {
        string titleAr
        string titleEn
        string category "government|parliament|constitution|budget|debt|elections|economy|governorate_stats|industry"
        string summaryAr
        string summaryEn
        string contentAr
        string contentEn
        string sourcesChecked "array of nameEn+url+accessible"
        number findingsCount
        number discrepanciesFound
        number generatedAt
        string agentModel
    }

    pipelineProgress {
        string runId
        string step
        string status "pending|running|success|failed|skipped"
        string message "optional"
        string messageAr "optional"
        number recordsUpdated "optional"
        number startedAt "optional"
        number completedAt "optional"
        string error "optional"
    }

    %% ═══════════════════════════════════════════════
    %% LLM COUNCIL
    %% ═══════════════════════════════════════════════

    councilSessions {
        string triggerType "github_issue|data_refresh|manual"
        string triggerRef
        string category "government|parliament|constitution|budget|debt|elections|governorate_stats"
        string tableName
        string fieldName "optional"
        string proposedValue "optional"
        string currentValue "optional"
        string sourceUrl "optional"
        string sourceType "gov_eg|international_org|media|other"
        string status "pending|approved|rejected|needs_human_review"
        string finalConfidence "optional high|medium|low"
        number resolvedAt "optional"
        string resolvedBy "optional"
        number createdAt
    }

    councilVotes {
        string model
        string provider
        string vote "approve|reject|abstain"
        string confidence "high|medium|low"
        string reasoning
        boolean sourceVerified
        number votedAt
    }

    councilVotes ||--|| councilSessions : "sessionId"

    githubIssueProcessing {
        number issueNumber
        string issueType "data|ui|unknown"
        string status "queued|processing|council_review|approved|rejected|applied|spam"
        string parsedCategory "optional"
        string parsedDataPoint "optional"
        string parsedSourceUrl "optional"
        string authorUsername
        number authorAccountAge "optional"
        number duplicateOfIssue "optional"
        string batchId "optional"
        number processedAt "optional"
        number createdAt
    }

    githubIssueProcessing ||--o| councilSessions : "councilSessionId"

    %% ═══════════════════════════════════════════════
    %% POLLS
    %% ═══════════════════════════════════════════════

    polls {
        string questionAr
        string questionEn
        string category "economy|budget|debt|parliament|government|constitution|general"
        string options "array of labelAr+labelEn+votes"
        string contextAr "optional"
        string contextEn "optional"
        string dataNuggets "optional array"
        number totalVotes
        boolean isActive
        number expiresAt
        number createdAt
    }

    pollVotes {
        number optionIndex
        string visitorHash
        number votedAt
    }

    pollVotes ||--|| polls : "pollId"

    %% ═══════════════════════════════════════════════
    %% FUNDING
    %% ═══════════════════════════════════════════════

    fundingDonations {
        string donorName "optional"
        boolean isAnonymous
        number amount
        string currency
        number amountUsd
        string paymentProvider "github_sponsors|stripe|other"
        string externalTransactionId "optional"
        string status "pending|confirmed|refunded"
        string messageEn "optional"
        string messageAr "optional"
        number confirmedAt "optional"
        number createdAt
    }

    fundingAllocations {
        string categoryEn
        string categoryAr
        string category "infrastructure|ai_api_costs|development|data_acquisition|other"
        number amount
        string currency
        number amountUsd
        string descriptionEn
        string descriptionAr
        string receiptUrl "optional"
        string vendor "optional"
        boolean isRecurring
        string periodStart
        string periodEnd
        number createdAt
    }

    fundingSummary {
        string month
        number totalDonationsUsd
        number totalAllocatedUsd
        number balanceUsd
        number infrastructureCostUsd
        number aiApiCostUsd
        number developmentCostUsd
        number dataCostUsd
        number otherCostUsd
        number updatedAt
    }

    apiUsageLog {
        string provider
        string model
        string purpose
        number inputTokens
        number outputTokens
        number totalTokens
        number costUsd
        number durationMs
        boolean success
        number timestamp
    }

    %% ═══════════════════════════════════════════════
    %% INVESTMENT
    %% ═══════════════════════════════════════════════

    investmentOpportunities {
        string externalId
        string source "ida|gafi"
        string nameAr
        string nameEn
        string descriptionAr "optional"
        string descriptionEn "optional"
        string sector
        string sectorAr "optional"
        string sectorEn "optional"
        string governorate "optional"
        string governorateAr "optional"
        string type "industrial_unit|land_plot|major_opportunity|free_zone|investment_zone|sme_program"
        number costEgp "optional"
        number costUsd "optional"
        number unitAreaSqm "optional"
        number landAreaSqm "optional"
        number pricePerSqmEgp "optional"
        string status "available|under_development|reserved|unknown"
        string sourceUrl
        number sanadLevel
        number lastScrapedAt
    }

    investmentProjectDetails {
        number landCostEgp "optional"
        number constructionCostEgp "optional"
        number equipmentCostEgp "optional"
        number laborCostEgp "optional"
        number licensingFeesEgp "optional"
        number workingCapitalEgp "optional"
        number expectedRevenueEgp "optional"
        number expectedProfitMarginPct "optional"
        number paybackPeriodYears "optional"
        number employeesNeeded "optional"
        string incentivesEn "optional"
        string licensingStepsEn "optional"
        string rawDataJson "optional"
        string sourceUrl
        number sanadLevel
    }

    investmentProjectDetails ||--|| investmentOpportunities : "opportunityId"

    %% ═══════════════════════════════════════════════
    %% NEWS
    %% ═══════════════════════════════════════════════

    newsHeadlines {
        string title
        string url
        string sourceDomain
        string language
        number publishedAt
        string imageUrl "optional"
        number fetchedAt
    }

    %% ═══════════════════════════════════════════════
    %% GUIDE CHAT
    %% ═══════════════════════════════════════════════

    chatUsage {
        string userId "optional"
        string threadId
        string model
        string provider
        number promptTokens
        number completionTokens
        number totalTokens
        number costUsd
        number timestamp
    }
```
