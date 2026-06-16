import { internalQuery } from "./_generated/server";

export const getUiContext = internalQuery({
  args: {},
  handler: async (ctx) => {
    const investmentIndicators = [
      "egx30_annual_return",
      "egypt_real_estate_return",
      "gold_annual_return",
      "cbe_cd_rate",
      "egypt_tbill_rate",
      "inflation",
      "exchange_rate",
      "egypt_mortgage_rate",
    ];

    const [houseMembers, senateMembers, governorates, articles, ministries, recentDebtRecords, latestFiscalYear, investmentRecords] =
      await Promise.all([
        ctx.db
          .query("parliamentMembers")
          .withIndex("by_chamber_and_isCurrent", (q) =>
            q.eq("chamber", "house").eq("isCurrent", true),
          )
          .take(1000),
        ctx.db
          .query("parliamentMembers")
          .withIndex("by_chamber_and_isCurrent", (q) =>
            q.eq("chamber", "senate").eq("isCurrent", true),
          )
          .take(500),
        ctx.db.query("governorates").take(50),
        ctx.db.query("constitutionArticles").take(300),
        ctx.db.query("ministries").withIndex("by_sortOrder").take(80),
        ctx.db.query("debtRecords").withIndex("by_date").order("desc").take(10),
        ctx.db.query("fiscalYears").withIndex("by_year").order("desc").first(),
        Promise.all(
          investmentIndicators.map(async (indicator) => {
            const record = await ctx.db
              .query("economicIndicators")
              .withIndex("by_indicator_and_date", (q) => q.eq("indicator", indicator))
              .order("desc")
              .first();
            return record
              ? {
                  indicator,
                  value: record.value,
                  unit: record.unit,
                  date: record.date,
                  sanadLevel: record.sanadLevel,
                  sourceUrl: record.sourceUrl,
                }
              : null;
          }),
        ),
      ]);

    let latestExternal: number | null = null;
    let latestDomestic: number | null = null;
    let latestDebtToGdp: number | null = null;
    let debtSourceUrl = "https://data.worldbank.org";
    let debtSanadLevel = 2;

    for (const r of recentDebtRecords) {
      if (latestExternal === null && r.totalExternalDebt != null) {
        latestExternal = r.totalExternalDebt;
        debtSourceUrl = r.sourceUrl ?? debtSourceUrl;
        debtSanadLevel = r.sanadLevel ?? debtSanadLevel;
      }
      if (latestDomestic === null && r.totalDomesticDebt != null) latestDomestic = r.totalDomesticDebt;
      if (latestDebtToGdp === null && r.debtToGdpRatio != null) latestDebtToGdp = r.debtToGdpRatio;
      if (latestExternal !== null && latestDomestic !== null && latestDebtToGdp !== null) break;
    }

    return {
      government: {
        ministries: ministries.length,
        sourceUrl: "https://www.cabinet.gov.eg",
        sanadLevel: 1,
      },
      parliament: {
        members: houseMembers.length + senateMembers.length,
        house: houseMembers.length,
        senate: senateMembers.length,
        sourceUrl: "https://www.parliament.gov.eg",
        sanadLevel: 1,
      },
      governorates: {
        count: governorates.length,
        sourceUrl: "https://www.capmas.gov.eg",
        sanadLevel: 1,
      },
      constitution: {
        articles: articles.length,
        sourceUrl: "https://www.presidency.eg",
        sanadLevel: 1,
      },
      debt: {
        externalUsd: latestExternal ?? 0,
        domesticEgp: latestDomestic ?? 0,
        debtToGdpRatio: latestDebtToGdp,
        sourceUrl: debtSourceUrl,
        sanadLevel: debtSanadLevel,
      },
      budget: latestFiscalYear
        ? {
            year: latestFiscalYear.year,
            totalRevenue: latestFiscalYear.totalRevenue ?? 0,
            totalExpenditure: latestFiscalYear.totalExpenditure ?? 0,
            deficit: latestFiscalYear.deficit ?? 0,
            sourceUrl: latestFiscalYear.sourceUrl ?? "https://mof.gov.eg",
            sanadLevel: latestFiscalYear.sanadLevel,
          }
        : null,
      investment: investmentRecords.filter((record) => record !== null),
    };
  },
});
