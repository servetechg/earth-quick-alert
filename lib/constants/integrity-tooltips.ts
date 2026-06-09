/** Plain-language ℹ️ copy from Ready2Go AI Service docs (§9). */
export const INTEGRITY_TOOLTIPS = {
    status:
        'Our verdict on whether this document belongs in this plan. Compliant = good match (score ≥ 71); Under Review = borderline, worth a human look (41–70); Non-Compliant = likely mis-filed or unreadable (below 41).',
    score:
        'An overall confidence score from 0–100 that this document fits the plan. It blends four checks: content match (50%), filename match (19%), text quality (19%), and uniqueness (12%).',
    summary:
        'A review of this document — what it covers and the response actions it describes, plus what it does well and where it could improve. Shown in three sections (Overview / What went well / Areas for improvement).',
    analyzedAt: 'The date and time this analysis was performed.',
    notAnalyzed:
        'Integrity analysis runs when you upload a file. Large documents may take up to a minute.',
    componentScores: {
        content:
            "How closely the document's meaning matches what this plan is about. The biggest factor in the overall score (50%).",
        name: 'How well the filename matches the plan. Counts for 19%.',
        quality:
            'How readable the document was. Counts for 19%. Blank or scanned-image files score very low here.',
        duplication:
            'How unique this file is compared to others in the same plan. Counts for 12%.',
    },
    audit: {
        posture:
            'An overall readiness rating. Resilient = healthy; Steady = mostly fine with items to review; At Risk = significant gaps or deviations that need attention.',
        summary:
            "A review of what this account's plans cover, what they handle well, and where they could improve.",
        findings:
            'Up to eight key takeaways — a balanced mix of what is working well and what to improve across the plans.',
        averageScore:
            'The average integrity score (0–100) across all analysed files in the account.',
        totals:
            'Headline counts: how many plans and files exist, and how many have been analysed so far.',
        integrity:
            'How many files landed in each verdict bucket: Compliant, Under Review, Non-Compliant, and not-yet-analysed.',
        degraded:
            'This audit was generated from a reduced set of documents (a safety fallback), so it may be less complete than usual.',
    },
} as const;
