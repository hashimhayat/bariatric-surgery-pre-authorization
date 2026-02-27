"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { PatientListItem, PatientListResponse, EligibilityStatus } from "@/types/fhir";

interface PatientListProps {
    selectedId: string | null;
    eligibilityFilter: EligibilityStatus | "all";
    onEligibilityFilterChange: (filter: EligibilityStatus | "all") => void;
    onSelect: (id: string) => void;
}

function EligibilityDot({ status }: { status: EligibilityStatus | undefined }) {
    if (!status) return <span className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-600 animate-pulse" />;
    const colors: Record<string, string> = {
        eligible: "bg-emerald-500",
        not_eligible: "bg-red-500",
        unknown: "bg-amber-500",
    };
    const labels: Record<string, string> = {
        eligible: "Eligible",
        not_eligible: "Not Eligible",
        unknown: "Needs Review",
    };
    return <span className={`w-2 h-2 rounded-full ${colors[status]}`} title={labels[status]} />;
}

// ─── Shimmer skeleton row ─────────────────────────────────────────────────
function PatientRowSkeleton() {
    return (
        <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50 animate-pulse">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-2 h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 shrink-0" />
                    <div className="h-3.5 bg-zinc-200 dark:bg-zinc-700 rounded-md w-3/4" />
                </div>
                <div className="w-4 h-4 bg-zinc-200 dark:bg-zinc-700 rounded shrink-0" />
            </div>
            <div className="flex items-center gap-2 mt-2 ml-4">
                <div className="h-2.5 bg-zinc-200 dark:bg-zinc-700 rounded w-8" />
                <div className="w-1 h-1 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-2.5 bg-zinc-200 dark:bg-zinc-700 rounded w-14" />
            </div>
        </div>
    );
}

export default function PatientList({
    selectedId,
    eligibilityFilter,
    onEligibilityFilterChange,
    onSelect,
}: PatientListProps) {
    const [patients, setPatients] = useState<PatientListItem[]>([]);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const limit = 50;

    // Batch eligibility map for badge display + counts
    const [eligibilityMap, setEligibilityMap] = useState<Record<string, EligibilityStatus>>({});
    const [eligibilityLoaded, setEligibilityLoaded] = useState(false);

    // Request counter to prevent stale responses
    const requestIdRef = useRef(0);

    // Sentinel ref for IntersectionObserver
    const sentinelRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Fetch batch eligibility once for badges + counts
    useEffect(() => {
        fetch("/api/eligibility/batch")
            .then((res) => (res.ok ? res.json() : {}))
            .then((data: Record<string, EligibilityStatus>) => {
                setEligibilityMap(data);
                setEligibilityLoaded(true);
            })
            .catch(() => setEligibilityLoaded(true));
    }, []);

    const statusCounts = eligibilityLoaded
        ? Object.values(eligibilityMap).reduce(
            (acc, s) => { acc[s] = (acc[s] || 0) + 1; return acc; },
            {} as Record<string, number>
        )
        : {};

    // Reset list when search or filter changes
    useEffect(() => {
        setPatients([]);
        setPage(1);
        setTotal(0);
        setInitialLoading(true);
    }, [search, eligibilityFilter]);

    // Fetch patients — appends for page > 1, replaces for page === 1
    useEffect(() => {
        const currentRequestId = ++requestIdRef.current;

        const doFetch = async () => {
            if (page === 1) {
                setInitialLoading(true);
            } else {
                setLoadingMore(true);
            }
            setError(null);

            try {
                const params = new URLSearchParams({
                    page: page.toString(),
                    limit: limit.toString(),
                });
                if (search) params.set("search", search);
                if (eligibilityFilter !== "all") params.set("eligibility", eligibilityFilter);

                const res = await fetch(`/api/patients?${params}`);
                if (!res.ok) throw new Error("Failed to fetch patients");
                const data: PatientListResponse = await res.json();

                // Only apply if this is still the latest request
                if (currentRequestId === requestIdRef.current) {
                    if (page === 1) {
                        setPatients(data.patients);
                    } else {
                        setPatients((prev) => [...prev, ...data.patients]);
                    }
                    setTotal(data.total);
                }
            } catch (err) {
                if (currentRequestId === requestIdRef.current) {
                    setError(err instanceof Error ? err.message : "Unknown error");
                }
            } finally {
                if (currentRequestId === requestIdRef.current) {
                    setInitialLoading(false);
                    setLoadingMore(false);
                }
            }
        };

        doFetch();
    }, [search, page, eligibilityFilter]);

    const hasMore = patients.length < total;

    // IntersectionObserver to trigger loading more
    const loadMore = useCallback(() => {
        if (hasMore && !loadingMore && !initialLoading) {
            setPage((prev) => prev + 1);
        }
    }, [hasMore, loadingMore, initialLoading]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    loadMore();
                }
            },
            {
                root: scrollContainerRef.current,
                rootMargin: "200px",
                threshold: 0,
            }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [loadMore]);

    const genderIcon = (gender: string) => {
        switch (gender.toLowerCase()) {
            case "male": return "♂";
            case "female": return "♀";
            default: return "⚥";
        }
    };

    const filterOptions: { key: EligibilityStatus | "all"; label: string; count?: number }[] = [
        { key: "all", label: "All", count: Object.keys(eligibilityMap).length },
        { key: "eligible", label: "Eligible", count: statusCounts["eligible"] || 0 },
        { key: "not_eligible", label: "Ineligible", count: statusCounts["not_eligible"] || 0 },
        { key: "unknown", label: "Review", count: statusCounts["unknown"] || 0 },
    ];

    return (
        <div className="flex flex-col h-full">
            {/* Eligibility filter pills */}
            <div className="px-3 pt-3 pb-1 grid grid-cols-4 gap-1 bg-zinc-50 dark:bg-zinc-900/50">
                {filterOptions.map((opt) => (
                    <button
                        key={opt.key}
                        onClick={() => onEligibilityFilterChange(opt.key)}
                        className={`flex flex-col items-center px-1 py-1.5 text-[10px] font-medium rounded-md transition-colors cursor-pointer
              ${eligibilityFilter === opt.key
                                ? "bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100"
                                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                            }`}
                    >
                        <span className="text-sm font-bold tabular-nums">
                            {eligibilityLoaded ? (opt.count ?? 0) : "…"}
                        </span>
                        <span>{opt.label}</span>
                    </button>
                ))}
            </div>

            {/* Search */}
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
                <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name or ID..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-800/60
                       text-sm text-zinc-900 dark:text-zinc-100
                       placeholder:text-zinc-400 dark:placeholder:text-zinc-500
                       border border-zinc-200 dark:border-zinc-700
                       focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500
                       transition-all"
                    />
                </div>
                <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                    {total.toLocaleString()} patient{total !== 1 ? "s" : ""}
                </p>
            </div>

            {/* Patient list */}
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pb-24">
                {initialLoading ? (
                    // Initial shimmer skeletons
                    <div>
                        {Array.from({ length: 8 }).map((_, i) => (
                            <PatientRowSkeleton key={i} />
                        ))}
                    </div>
                ) : error ? (
                    <div className="p-4 text-sm text-red-500">{error}</div>
                ) : patients.length === 0 ? (
                    <div className="p-4 text-sm text-zinc-400 text-center">No patients found</div>
                ) : (
                    <>
                        <ul>
                            {patients.map((p) => (
                                <li key={p.id}>
                                    <button
                                        onClick={() => onSelect(p.id)}
                                        className={`w-full text-left px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50
                             transition-colors cursor-pointer
                             ${selectedId === p.id
                                                ? "bg-blue-50 dark:bg-blue-500/10 border-l-2 border-l-blue-500"
                                                : "hover:bg-zinc-50 dark:hover:bg-zinc-800/30 border-l-2 border-l-transparent"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <EligibilityDot status={eligibilityMap[p.id]} />
                                                <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100 truncate">
                                                    {p.name}
                                                </span>
                                            </div>
                                            <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono shrink-0">
                                                {genderIcon(p.gender)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5 ml-4">
                                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                                {p.age !== null ? `${p.age}y` : "Age unknown"}
                                            </span>
                                            <span className="text-xs text-zinc-300 dark:text-zinc-600">•</span>
                                            <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono truncate">
                                                {p.id.slice(0, 8)}
                                            </span>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>

                        {/* Loading more shimmers */}
                        {loadingMore && (
                            <div>
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <PatientRowSkeleton key={`more-${i}`} />
                                ))}
                            </div>
                        )}

                        {/* Sentinel for IntersectionObserver */}
                        {hasMore && <div ref={sentinelRef} className="h-1" />}

                        {/* End-of-list indicator */}
                        {!hasMore && patients.length > 0 && (
                            <div className="py-4 text-center">
                                <p className="text-[11px] text-zinc-400 dark:text-zinc-600">
                                    All {total.toLocaleString()} patients loaded
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
