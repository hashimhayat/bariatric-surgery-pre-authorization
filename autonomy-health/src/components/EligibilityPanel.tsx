"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { EligibilityResult, CriterionStatus, EligibilityCriterion } from "@/types/fhir";

interface EligibilityPanelProps {
    patientId: string | null;
}

// ─── Status Badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { bg: string; text: string; label: string }> = {
        eligible: {
            bg: "bg-emerald-100 dark:bg-emerald-500/10",
            text: "text-emerald-700 dark:text-emerald-400",
            label: "Eligible",
        },
        not_eligible: {
            bg: "bg-red-100 dark:bg-red-500/10",
            text: "text-red-700 dark:text-red-400",
            label: "Not Eligible",
        },
        unknown: {
            bg: "bg-amber-100 dark:bg-amber-500/10",
            text: "text-amber-700 dark:text-amber-400",
            label: "Needs Review",
        },
    };
    const c = config[status] ?? config.unknown;
    return (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 ${c.bg} ${c.text}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${status === "eligible" ? "bg-emerald-500" : status === "not_eligible" ? "bg-red-500" : "bg-amber-500"}`} />
            {c.label}
        </span>
    );
}

// ─── Criterion Status Icon ──────────────────────────────────────────────────

function CriterionStatusIcon({ status }: { status: CriterionStatus }) {
    if (status === "met") {
        return (
            <svg className="w-5 h-5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        );
    }
    if (status === "unmet") {
        return (
            <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        );
    }
    return (
        <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
        </svg>
    );
}

// ─── Resource Type Badge ────────────────────────────────────────────────────

function ResourceTypeBadge({ type }: { type: string }) {
    const colors: Record<string, string> = {
        Observation: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
        Condition: "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400",
        Procedure: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
        DiagnosticReport: "bg-teal-50 text-teal-600 dark:bg-teal-500/10 dark:text-teal-400",
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded ${colors[type] ?? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
            {type}
        </span>
    );
}

// ─── Detail Field ───────────────────────────────────────────────────────────

function DetailField({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
    if (!value) return null;
    return (
        <div className="py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">{label}</p>
            <p className={`text-[13px] text-zinc-700 dark:text-zinc-200 break-all ${mono ? "font-mono text-[12px]" : ""}`}>
                {value}
            </p>
        </div>
    );
}

// ─── Third-Pane Detail Panel ────────────────────────────────────────────────

function DetailPanel({
    criterion,
    onClose,
    width,
}: {
    criterion: EligibilityCriterion;
    onClose: () => void;
    width: number;
}) {
    const statusColor = (s: CriterionStatus) =>
        s === "met" ? "text-emerald-600 dark:text-emerald-400"
            : s === "unmet" ? "text-red-600 dark:text-red-400"
                : "text-amber-600 dark:text-amber-400";

    const statusBg = (s: CriterionStatus) =>
        s === "met" ? "bg-emerald-100 dark:bg-emerald-500/10"
            : s === "unmet" ? "bg-red-100 dark:bg-red-500/10"
                : "bg-amber-100 dark:bg-amber-500/10";

    return (
        <aside
            style={{ width: `${width}px` }}
            className="shrink-0 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 flex flex-col h-full"
        >
            <style>{`
                @keyframes slideIn { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }
                .panel-animate { animation: slideIn 0.2s ease-out; }
            `}</style>

            {/* Panel header */}
            <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Criterion Detail</p>
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
            <div className="flex-1 overflow-y-auto px-5 py-4 panel-animate">
                {/* Criterion header */}
                <div className="flex items-center gap-2 mb-4">
                    <CriterionStatusIcon status={criterion.status} />
                    <h3 className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-100">
                        {criterion.name}
                    </h3>
                </div>

                {/* Status badge */}
                <div className="py-2 border-b border-zinc-100 dark:border-zinc-800">
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-1">Status</p>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider rounded-full ${statusBg(criterion.status)} ${statusColor(criterion.status)}`}>
                        {criterion.status}
                    </span>
                </div>

                {/* Evaluation detail */}
                <DetailField label="Evaluation Detail" value={criterion.detail} />

                {/* All evidence items */}
                <div className="py-3">
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-3">
                        Supporting Evidence ({criterion.evidence.length})
                    </p>

                    {criterion.evidence.length > 0 ? (
                        <div className="space-y-2">
                            {criterion.evidence.map((ev, i) => (
                                <div
                                    key={i}
                                    className="px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200/60 dark:border-zinc-700/30"
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <ResourceTypeBadge type={ev.resourceType} />
                                        <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600">
                                            #{i + 1}
                                        </span>
                                    </div>
                                    <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-200 leading-snug mb-1.5">
                                        {ev.display}
                                    </p>
                                    <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 break-all">
                                        {ev.resourceType}/{ev.resourceId}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200/60 dark:border-zinc-700/30">
                            <svg className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                            </svg>
                            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                                {criterion.status === "unknown"
                                    ? "No supporting evidence found in patient records. This data may be missing from the source system."
                                    : criterion.status === "unmet"
                                        ? "No qualifying evidence found in patient records."
                                        : "No additional evidence to display."}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </aside>
    );
}

// ─── Criterion Row (clickable, no accordion) ────────────────────────────────

function CriterionRow({
    criterion,
    isSelected,
    onClick,
}: {
    criterion: EligibilityCriterion;
    isSelected: boolean;
    onClick: () => void;
}) {
    const hasEvidence = criterion.evidence.length > 0;

    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-4 py-4 flex items-start gap-3 transition-colors duration-100 cursor-pointer
                ${isSelected
                    ? "bg-blue-50/60 dark:bg-blue-500/5"
                    : "hover:bg-zinc-100/50 dark:hover:bg-zinc-700/20"
                }`}
        >
            <CriterionStatusIcon status={criterion.status} />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                        {criterion.name}
                    </span>
                    <span
                        className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${criterion.status === "met"
                            ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                            : criterion.status === "unmet"
                                ? "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400"
                                : "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
                            }`}
                    >
                        {criterion.status}
                    </span>
                    {hasEvidence && (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                            {criterion.evidence.length} evidence
                        </span>
                    )}
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {criterion.detail}
                </p>
            </div>
            <svg className="w-4 h-4 text-zinc-300 dark:text-zinc-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
        </button>
    );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function EligibilityPanel({ patientId }: EligibilityPanelProps) {
    const [result, setResult] = useState<EligibilityResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedCriterion, setSelectedCriterion] = useState<EligibilityCriterion | null>(null);
    const [detailWidth, setDetailWidth] = useState(384);
    const isDragging = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isDragging.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const handleMouseMove = (ev: MouseEvent) => {
            if (!isDragging.current || !containerRef.current) return;
            const containerRect = containerRef.current.getBoundingClientRect();
            const newDetailWidth = containerRect.right - ev.clientX;
            const maxDetailWidth = containerRect.width - 400;
            setDetailWidth(Math.max(280, Math.min(newDetailWidth, maxDetailWidth)));
        };

        const handleMouseUp = () => {
            isDragging.current = false;
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);
    }, []);

    useEffect(() => {
        if (!patientId) {
            setResult(null);
            setSelectedCriterion(null);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);
        setSelectedCriterion(null);

        fetch(`/api/patients/${patientId}/eligibility`)
            .then((res) => {
                if (!res.ok) throw new Error("Failed to fetch eligibility");
                return res.json();
            })
            .then((data: EligibilityResult) => {
                if (!cancelled) setResult(data);
            })
            .catch((err) => {
                if (!cancelled) setError(err.message);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [patientId]);

    if (!patientId) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-zinc-400 dark:text-zinc-500">Select a patient to view eligibility</p>
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
                    <span>Evaluating eligibility…</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-red-500 font-medium">{error}</p>
            </div>
        );
    }

    if (!result) return null;

    const metCount = result.criteria.filter(c => c.status === "met").length;
    const totalCount = result.criteria.length;

    return (
        <div ref={containerRef} className="flex h-full">
            {/* Main scrollable content */}
            <div className="flex-1 min-w-0 h-full overflow-y-auto">
                <div className="px-5 py-5 space-y-6">
                    {/* Status header */}
                    <div className="flex items-start justify-between gap-4">
                        <div className="space-y-2">
                            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                                Pre-Authorization Review
                            </h2>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xl">
                                {result.summary}
                            </p>
                        </div>
                        <StatusBadge status={result.status} />
                    </div>

                    {/* Progress bar */}
                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                            <div
                                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                style={{ width: `${totalCount > 0 ? (metCount / totalCount) * 100 : 0}%` }}
                            />
                        </div>
                        <span className="text-[12px] font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                            {metCount}/{totalCount} criteria met
                        </span>
                    </div>

                    {/* Criteria table — clickable rows */}
                    <div className="bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                Eligibility Criteria
                            </h3>
                            <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                                Click a row for details →
                            </p>
                        </div>
                        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                            {result.criteria.map((criterion, i) => (
                                <CriterionRow
                                    key={i}
                                    criterion={criterion}
                                    isSelected={selectedCriterion === criterion}
                                    onClick={() =>
                                        setSelectedCriterion(
                                            selectedCriterion === criterion ? null : criterion
                                        )
                                    }
                                />
                            ))}
                        </div>
                    </div>

                    {/* Unknown reasons */}
                    {result.unknownReasons.length > 0 && (
                        <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-xl p-4">
                            <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">
                                ⚠ Items Requiring Review
                            </h3>
                            <ul className="space-y-1">
                                {result.unknownReasons.map((reason, i) => (
                                    <li key={i} className="text-sm text-amber-600 dark:text-amber-400/80 flex items-start gap-2">
                                        <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-400 shrink-0" />
                                        {reason}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            {/* Third-pane: Drag Handle + Detail Panel */}
            {selectedCriterion && (
                <>
                    <div
                        onMouseDown={handleMouseDown}
                        className="w-1.5 h-full cursor-col-resize bg-transparent hover:bg-blue-400/30 active:bg-blue-500/40 transition-colors flex items-center justify-center shrink-0 group"
                    >
                        <div className="w-0.5 h-8 rounded-full bg-zinc-300 dark:bg-zinc-600 group-hover:bg-blue-400 transition-colors" />
                    </div>
                    <DetailPanel
                        criterion={selectedCriterion}
                        onClose={() => setSelectedCriterion(null)}
                        width={detailWidth}
                    />
                </>
            )}
        </div>
    );
}
