"use client";

import { useState, useEffect, useCallback } from "react";
import { TimelineEntry, TimelineResponse } from "@/types/fhir";

interface TimelineProps {
    patientId: string | null;
}

type TypeFilter = "all" | "observation" | "procedure";

function formatDate(dateStr: string | null): string {
    if (!dateStr) return "—";
    try {
        return new Date(dateStr).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    } catch {
        return dateStr;
    }
}

function formatTime(dateStr: string | null): string {
    if (!dateStr) return "";
    try {
        return new Date(dateStr).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return "";
    }
}

function groupByDate(entries: TimelineEntry[]): Map<string, TimelineEntry[]> {
    const groups = new Map<string, TimelineEntry[]>();
    for (const entry of entries) {
        const key = formatDate(entry.date);
        const group = groups.get(key) ?? [];
        group.push(entry);
        groups.set(key, group);
    }
    return groups;
}

function TypeBadge({ type }: { type: "Observation" | "Procedure" }) {
    const isObs = type === "Observation";
    return (
        <span
            className={`shrink-0 px-2 py-0.5 text-xs font-medium rounded-full
        ${isObs
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400"
                    : "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400"
                }`}
        >
            {isObs ? "Obs" : "Proc"}
        </span>
    );
}

function CategoryPill({ category }: { category: string }) {
    const colors: Record<string, string> = {
        "Vital Signs": "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
        "Laboratory": "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
        "Survey": "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400",
        "Social History": "bg-pink-100 text-pink-700 dark:bg-pink-500/10 dark:text-pink-400",
    };

    return (
        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${colors[category] ?? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
            {category}
        </span>
    );
}

// ─── Detail Panel for Timeline ────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
    if (!value) return null;
    return (
        <div className="py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">{label}</p>
            <p className="text-[13px] text-zinc-700 dark:text-zinc-200">{value}</p>
        </div>
    );
}

function TimelineDetailPanel({ entry, onClose }: { entry: TimelineEntry; onClose: () => void }) {
    const isObs = entry.resourceType === "Observation";

    return (
        <aside className="w-96 shrink-0 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 flex flex-col h-full animate-slideIn">
            {/* Panel header */}
            <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">
                        {isObs ? "Observation Detail" : "Procedure Detail"}
                    </p>
                    <TypeBadge type={entry.resourceType} />
                </div>
                <button
                    onClick={onClose}
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            {/* Panel body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
                <h3 className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-100 mb-4 leading-snug">{entry.name}</h3>

                <DetailField label="Date" value={formatDate(entry.date)} />
                <DetailField label="Time" value={formatTime(entry.date)} />
                <DetailField label="Status" value={entry.status} />

                {entry.value && (
                    <div className="py-2 border-b border-zinc-100 dark:border-zinc-800">
                        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">Value</p>
                        <p className="text-[18px] font-semibold text-zinc-800 dark:text-zinc-100">
                            {entry.value}
                            {entry.unit && <span className="text-[12px] font-normal text-zinc-400 ml-1">{entry.unit}</span>}
                        </p>
                    </div>
                )}

                <DetailField label="Category" value={entry.category} />
                <DetailField label="Code" value={entry.code} />
                <DetailField label="Resource Type" value={entry.resourceType} />
                <DetailField label="Resource ID" value={entry.fhirResourceId} />
            </div>
        </aside>
    );
}

// ─── Main component ───────────────────────────────────────────────────────

export default function Timeline({ patientId }: TimelineProps) {
    const [entries, setEntries] = useState<TimelineEntry[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
    const [selectedEntry, setSelectedEntry] = useState<TimelineEntry | null>(null);

    const fetchTimeline = useCallback(
        async (cursorValue: string | null, append: boolean) => {
            if (!patientId) return;

            if (append) setLoadingMore(true);
            else setLoading(true);
            setError(null);

            try {
                const params = new URLSearchParams({ limit: "50", type: typeFilter });
                if (cursorValue) params.set("cursor", cursorValue);

                const res = await fetch(`/api/patients/${patientId}/timeline?${params}`);
                if (!res.ok) throw new Error("Failed to fetch timeline");
                const data: TimelineResponse = await res.json();

                setEntries((prev) => (append ? [...prev, ...data.entries] : data.entries));
                setCursor(data.nextCursor);
                setHasMore(data.hasMore);
                setTotal(data.total);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Unknown error");
            } finally {
                setLoading(false);
                setLoadingMore(false);
            }
        },
        [patientId, typeFilter]
    );

    // Reset and fetch on patient/filter change
    useEffect(() => {
        setEntries([]);
        setCursor(null);
        setSelectedEntry(null);
        fetchTimeline(null, false);
    }, [patientId, typeFilter, fetchTimeline]);

    // ─── Empty state ──────────────────────────────────────────────────────
    if (!patientId) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-zinc-400 dark:text-zinc-500">Select a patient to view their timeline</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="flex items-center gap-3 text-zinc-400">
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Loading timeline…</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <p className="text-red-500 font-medium">{error}</p>
                    <button onClick={() => fetchTimeline(null, false)} className="mt-2 text-sm text-blue-500 hover:underline">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    const grouped = groupByDate(entries);

    return (
        <div className="flex h-full">
            {/* Main timeline scroll area */}
            <div className="flex-1 min-w-0 h-full overflow-y-auto">
                <div className="p-5">
                    {/* Header + filter */}
                    <div className="flex items-center justify-between mb-5">
                        <p className="text-sm text-zinc-400 dark:text-zinc-500">
                            {total.toLocaleString()} entries
                        </p>
                        <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800/60 rounded-lg p-0.5">
                            {(["all", "observation", "procedure"] as const).map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setTypeFilter(t)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer
                  ${typeFilter === t
                                            ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                                            : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                                        }`}
                                >
                                    {t === "all" ? "All" : t === "observation" ? "Observations" : "Procedures"}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Timeline */}
                    {entries.length === 0 ? (
                        <p className="text-sm text-zinc-400 text-center py-12">No entries found</p>
                    ) : (
                        <div className="space-y-6">
                            {Array.from(grouped.entries()).map(([dateLabel, items]) => (
                                <div key={dateLabel}>
                                    {/* Date header */}
                                    <div className="sticky top-0 z-10 bg-zinc-50/95 dark:bg-zinc-950/95 backdrop-blur-sm py-2 mb-2">
                                        <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                                            {dateLabel}
                                        </h3>
                                    </div>

                                    {/* Entries for this date */}
                                    <div className="space-y-1.5 ml-3 border-l-2 border-zinc-200 dark:border-zinc-800 pl-4">
                                        {items.map((entry) => (
                                            <div
                                                key={`${entry.resourceType}-${entry.id}`}
                                                onClick={() => setSelectedEntry(entry)}
                                                className={`flex items-start gap-3 py-2 px-3 rounded-lg cursor-pointer transition-colors
                                 border
                                 ${selectedEntry?.id === entry.id
                                                        ? "bg-blue-50/60 dark:bg-blue-500/5 border-blue-200 dark:border-blue-500/20"
                                                        : "bg-white dark:bg-zinc-800/30 border-zinc-100 dark:border-zinc-800 hover:border-zinc-200 dark:hover:border-zinc-700"
                                                    }`}
                                            >
                                                <TypeBadge type={entry.resourceType} />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                                                        {entry.name}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                        {entry.value && (
                                                            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                                                                {entry.value}
                                                                {entry.unit && <span className="font-normal text-zinc-400 ml-0.5">{entry.unit}</span>}
                                                            </span>
                                                        )}
                                                        {entry.category && <CategoryPill category={entry.category} />}
                                                        <span className="text-xs text-zinc-400">{formatTime(entry.date)}</span>
                                                    </div>
                                                </div>
                                                <svg className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 mt-1.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                                </svg>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Load more */}
                    {hasMore && (
                        <div className="mt-6 text-center">
                            <button
                                onClick={() => fetchTimeline(cursor, true)}
                                disabled={loadingMore}
                                className="px-6 py-2.5 text-sm font-medium rounded-lg
                         bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300
                         hover:bg-zinc-200 dark:hover:bg-zinc-700
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-colors cursor-pointer"
                            >
                                {loadingMore ? "Loading…" : "Load more"}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Detail Panel (Third Pane) ── */}
            {selectedEntry && (
                <TimelineDetailPanel entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
            )}
        </div>
    );
}
