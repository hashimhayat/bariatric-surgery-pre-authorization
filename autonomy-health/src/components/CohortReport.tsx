"use client";

import { useState, useEffect } from "react";

interface CohortReport {
    total: number;
    categories: {
        eligible: { count: number; percentage: number };
        not_eligible: { count: number; percentage: number };
        unknown: { count: number; percentage: number };
    };
    criteriaBreakdown: {
        name: string;
        description: string;
        metCount: number;
        metPercentage: number;
    }[];
    eligiblePatients: {
        id: string;
        name: string;
        gender: string;
        age: number | null;
        bmi: number;
        comorbidities: number;
        hasWeightDocs: boolean;
        hasPsychDocs: boolean;
    }[];
    unknownReasons: { reason: string; count: number; percentage: number }[];
    notEligibleReasons: { reason: string; count: number; percentage: number }[];
}

function StatCard({
    label,
    count,
    percentage,
    color,
    total,
}: {
    label: string;
    count: number;
    percentage: number;
    color: string;
    total: number;
}) {
    return (
        <div className="bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
                <span className={`w-3 h-3 rounded-full ${color}`} />
                <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
            </div>
            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 tabular-nums">
                {count.toLocaleString()}
            </div>
            <div className="mt-1 text-sm text-zinc-400 dark:text-zinc-500">
                {percentage}% of {total.toLocaleString()}
            </div>
            <div className="mt-3 h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${color}`}
                    style={{ width: `${Math.max(percentage, 1)}%` }}
                />
            </div>
        </div>
    );
}

function CheckIcon() {
    return (
        <svg className="w-4 h-4 text-emerald-500 mx-auto" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
    );
}

function ReasonsList({
    title,
    subtitle,
    reasons,
    color,
}: {
    title: string;
    subtitle: string;
    reasons: { reason: string; count: number; percentage: number }[];
    color: string;
}) {
    if (reasons.length === 0) return null;
    return (
        <div className="bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{title}</h3>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{subtitle}</p>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {reasons.map((item, i) => (
                    <div key={i} className="px-5 py-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{item.reason}</div>
                            <div className="mt-2 h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden max-w-xs">
                                <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${item.percentage}%` }} />
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50 tabular-nums">{item.count.toLocaleString()}</span>
                            <span className="text-xs text-zinc-400 ml-1">({item.percentage}%)</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function CohortReportPanel() {
    const [report, setReport] = useState<CohortReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/cohort/report")
            .then((res) => {
                if (!res.ok) throw new Error("Failed to load report");
                return res.json();
            })
            .then((data: CohortReport) => setReport(data))
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="flex items-center gap-3 text-zinc-400">
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Generating cohort report…</span>
                </div>
            </div>
        );
    }

    if (error || !report) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-red-500">{error ?? "No data"}</p>
            </div>
        );
    }

    const { total, categories, criteriaBreakdown, eligiblePatients, unknownReasons, notEligibleReasons } = report;

    return (
        <div className="h-full overflow-y-auto">
            <div className="max-w-4xl mx-auto p-6 space-y-6">
                {/* Header */}
                <div>
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                        Cohort Eligibility Report
                    </h2>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        Bariatric surgery eligibility across {total.toLocaleString()} patients
                    </p>
                </div>

                {/* Category cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <StatCard label="Eligible" count={categories.eligible.count} percentage={categories.eligible.percentage} color="bg-emerald-500" total={total} />
                    <StatCard label="Not Eligible" count={categories.not_eligible.count} percentage={categories.not_eligible.percentage} color="bg-red-500" total={total} />
                    <StatCard label="Unknown" count={categories.unknown.count} percentage={categories.unknown.percentage} color="bg-amber-500" total={total} />
                </div>

                {/* Distribution bar */}
                <div className="bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">Population Distribution</h3>
                    <div className="flex h-8 rounded-lg overflow-hidden">
                        <div className="bg-emerald-500 flex items-center justify-center" style={{ width: `${Math.max(categories.eligible.percentage, 2)}%` }} title={`Eligible: ${categories.eligible.count}`}>
                            {categories.eligible.percentage >= 4 && <span className="text-[10px] font-bold text-white">{categories.eligible.percentage}%</span>}
                        </div>
                        <div className="bg-red-400 flex items-center justify-center" style={{ width: `${categories.not_eligible.percentage}%` }} title={`Not Eligible: ${categories.not_eligible.count}`}>
                            <span className="text-[10px] font-bold text-white">{categories.not_eligible.percentage}%</span>
                        </div>
                        <div className="bg-amber-400 flex items-center justify-center" style={{ width: `${Math.max(categories.unknown.percentage, 2)}%` }} title={`Unknown: ${categories.unknown.count}`}>
                            {categories.unknown.percentage >= 3 && <span className="text-[10px] font-bold text-white">{categories.unknown.percentage}%</span>}
                        </div>
                    </div>
                    <div className="flex gap-4 mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Eligible</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" />Not Eligible</span>
                        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" />Unknown</span>
                    </div>
                </div>

                {/* Reasons — top level insights */}
                <ReasonsList
                    title={`Top Reasons for Unknown Status (${categories.unknown.count})`}
                    subtitle="Why patients could not be definitively classified"
                    reasons={unknownReasons}
                    color="bg-amber-400"
                />

                <ReasonsList
                    title={`Top Reasons for Not Eligible (${categories.not_eligible.count.toLocaleString()})`}
                    subtitle="Why patients did not meet eligibility criteria"
                    reasons={notEligibleReasons}
                    color="bg-red-400"
                />

                {/* Criteria Breakdown */}
                <div className="bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
                        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Criteria Breakdown</h3>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                            How many patients meet each eligibility criterion
                        </p>
                    </div>
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {criteriaBreakdown.map((item, i) => (
                            <div key={i} className="px-5 py-3.5 flex items-center gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{item.name}</div>
                                    <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{item.description}</div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <div className="w-24 h-1.5 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 rounded-full transition-all duration-700" style={{ width: `${item.metPercentage}%` }} />
                                    </div>
                                    <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50 tabular-nums w-14 text-right">
                                        {item.metCount.toLocaleString()}
                                    </span>
                                    <span className="text-xs text-zinc-400 tabular-nums w-12 text-right">{item.metPercentage}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Eligible Patients */}
                {eligiblePatients.length > 0 && (
                    <div className="bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
                            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                Eligible Patients ({eligiblePatients.length})
                            </h3>
                            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                                Patients meeting all bariatric surgery eligibility criteria
                            </p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-zinc-50 dark:bg-zinc-800/80">
                                        <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Patient</th>
                                        <th className="px-4 py-2.5 text-center text-xs font-medium text-zinc-500 uppercase tracking-wider">Age</th>
                                        <th className="px-4 py-2.5 text-center text-xs font-medium text-zinc-500 uppercase tracking-wider">BMI</th>
                                        <th className="px-4 py-2.5 text-center text-xs font-medium text-zinc-500 uppercase tracking-wider">Comorbidities</th>
                                        <th className="px-4 py-2.5 text-center text-xs font-medium text-zinc-500 uppercase tracking-wider">Weight Docs</th>
                                        <th className="px-4 py-2.5 text-center text-xs font-medium text-zinc-500 uppercase tracking-wider">Psych Eval</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                    {eligiblePatients.map((p) => (
                                        <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                                    <div>
                                                        <div className="font-medium text-zinc-800 dark:text-zinc-200">{p.name}</div>
                                                        <div className="text-xs text-zinc-400 font-mono">{p.id.slice(0, 8)}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center text-zinc-600 dark:text-zinc-400 tabular-nums">{p.age !== null ? `${p.age}y` : "—"}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className="font-bold text-zinc-900 dark:text-zinc-50 tabular-nums">{p.bmi}</span>
                                                <span className="text-xs text-zinc-400 ml-0.5">kg/m²</span>
                                            </td>
                                            <td className="px-4 py-3 text-center text-zinc-600 dark:text-zinc-400 tabular-nums">{p.comorbidities}</td>
                                            <td className="px-4 py-3">{p.hasWeightDocs ? <CheckIcon /> : <span className="text-zinc-300 text-center block">—</span>}</td>
                                            <td className="px-4 py-3">{p.hasPsychDocs ? <CheckIcon /> : <span className="text-zinc-300 text-center block">—</span>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
