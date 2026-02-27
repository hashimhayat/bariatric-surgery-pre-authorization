"use client";

import { useState, useEffect, useRef, useCallback, ReactNode } from "react";
import {
    ClinicalSnapshot,
    ConditionSummary,
    ProcedureSummary,
    ObservationSummary,
    MedicationSummary,
    AllergySummary,
    EncounterSummary,
    DiagnosticReportSummary,
    ImmunizationSummary,
    DocumentReferenceSummary,
    DeviceSummary,
} from "@/types/fhir";

interface AIReview {
    clinicalSummary: string;
    source: "ai" | "fallback";
}

interface ClinicalSnapshotProps {
    patientId: string | null;
}

// Vital history types
interface VitalHistoryPoint {
    date: string;
    value: number;
    unit: string;
}

interface VitalHistoryData {
    name: string;
    loincCode: string;
    unit: string;
    points: VitalHistoryPoint[];
    accent: string;
    loading?: boolean;
}

// Detail panel item types
type DetailItem =
    | { type: "encounter"; data: EncounterSummary }
    | { type: "report"; data: DiagnosticReportSummary }
    | { type: "medication"; data: MedicationSummary }
    | { type: "allergy"; data: AllergySummary }
    | { type: "condition"; data: ConditionSummary }
    | { type: "procedure"; data: ProcedureSummary }
    | { type: "immunization"; data: ImmunizationSummary }
    | { type: "vital"; data: VitalHistoryData }
    | { type: "document"; data: DocumentReferenceSummary }
    | { type: "device"; data: DeviceSummary };

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

// ─── Collapsible Section ──────────────────────────────────────────────────

function CollapsibleSection({
    title,
    count,
    badge,
    children,
    defaultOpen = true,
}: {
    title: string;
    count?: number;
    badge?: ReactNode;
    children: ReactNode;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);

    return (
        <section>
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-2 w-full text-left group cursor-pointer mb-2"
            >
                <svg
                    className={`w-3 h-3 text-zinc-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                    fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                <h2 className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-widest">
                    {title}
                </h2>
                {count !== undefined && (
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-600 font-normal">{count}</span>
                )}
                {badge}
            </button>
            {open && children}
        </section>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────

// ─── SVG Line Chart ────────────────────────────────────────────────────

function VitalChart({ points, accent, unit }: { points: VitalHistoryPoint[]; accent: string; unit: string }) {
    if (points.length < 2) {
        return <p className="text-[13px] text-zinc-400 italic py-4">Not enough data points for a chart</p>;
    }

    const W = 340;
    const H = 160;
    const PAD = { top: 20, right: 15, bottom: 30, left: 45 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    const values = points.map(p => p.value);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const range = maxV - minV || 1;
    const padding = range * 0.1;
    const yMin = minV - padding;
    const yMax = maxV + padding;

    const x = (i: number) => PAD.left + (i / (points.length - 1)) * chartW;
    const y = (v: number) => PAD.top + chartH - ((v - yMin) / (yMax - yMin)) * chartH;

    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

    // Y-axis ticks (5 ticks)
    const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (i / 4) * (yMax - yMin));

    // X-axis labels — show first, middle, last
    const xLabels = [
        { i: 0, label: formatDate(points[0].date) },
        { i: Math.floor(points.length / 2), label: formatDate(points[Math.floor(points.length / 2)].date) },
        { i: points.length - 1, label: formatDate(points[points.length - 1].date) },
    ];

    // Extract color class for SVG stroke
    const colorMap: Record<string, string> = {
        "text-blue-600 dark:text-blue-400": "#2563eb",
        "text-rose-600 dark:text-rose-400": "#e11d48",
        "text-rose-500 dark:text-rose-400": "#f43f5e",
        "text-purple-600 dark:text-purple-400": "#9333ea",
        "text-emerald-600 dark:text-emerald-400": "#059669",
    };
    const strokeColor = colorMap[accent] ?? "#3b82f6";

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
            {/* Grid lines */}
            {yTicks.map((tick, i) => (
                <g key={i}>
                    <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)}
                        stroke="#e4e4e7" strokeWidth={0.5} strokeDasharray="3,3" />
                    <text x={PAD.left - 5} y={y(tick) + 3} textAnchor="end"
                        className="text-[8px] fill-zinc-400">{tick.toFixed(tick % 1 ? 1 : 0)}</text>
                </g>
            ))}

            {/* Unit label */}
            <text x={4} y={PAD.top - 6} className="text-[7px] fill-zinc-400 uppercase">{unit}</text>

            {/* X-axis labels */}
            {xLabels.map(({ i, label }) => (
                <text key={i} x={x(i)} y={H - 4} textAnchor="middle" className="text-[7px] fill-zinc-400">{label}</text>
            ))}

            {/* Area fill */}
            <path
                d={`${pathD} L${x(points.length - 1).toFixed(1)},${(PAD.top + chartH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + chartH).toFixed(1)} Z`}
                fill={strokeColor} fillOpacity={0.06}
            />

            {/* Line */}
            <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

            {/* Dots */}
            {points.map((p, i) => (
                <circle key={i} cx={x(i)} cy={y(p.value)} r={2.5} fill="white" stroke={strokeColor} strokeWidth={1.5} />
            ))}
        </svg>
    );
}

function VitalCard({
    label,
    observation,
    accent,
    onClick,
    isSelected,
}: {
    label: string;
    observation: ObservationSummary | null;
    accent: string;
    onClick?: () => void;
    isSelected?: boolean;
}) {
    return (
        <div
            onClick={onClick}
            className={`rounded-2xl border px-4 py-3.5 transition-colors overflow-hidden min-w-0
                ${onClick ? "cursor-pointer" : ""}
                ${isSelected
                    ? "bg-blue-50/50 dark:bg-blue-500/5 border-blue-300 dark:border-blue-500/30"
                    : "bg-white dark:bg-zinc-800/30 border-zinc-200/80 dark:border-zinc-700/40 hover:border-zinc-300 dark:hover:border-zinc-600"
                }`}
        >
            <p className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-widest mb-2 truncate">
                {label}
            </p>
            {observation ? (
                <>
                    <p className={`text-[22px] font-semibold tracking-tight ${accent} truncate`}>
                        {observation.value ?? "—"}
                        {observation.unit && (
                            <span className="text-[12px] font-normal text-zinc-400 ml-1">{observation.unit}</span>
                        )}
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-500 mt-1 truncate">{formatDate(observation.date)}</p>
                </>
            ) : (
                <p className="text-[13px] text-zinc-400 dark:text-zinc-600 italic">No data</p>
            )}
        </div>
    );
}

function ClickableRow({
    children,
    onClick,
    isSelected,
}: {
    children: ReactNode;
    onClick: () => void;
    isSelected?: boolean;
}) {
    return (
        <div
            onClick={onClick}
            className={`cursor-pointer transition-colors
                ${isSelected
                    ? "bg-blue-50/60 dark:bg-blue-500/5 border-l-2 border-l-blue-500"
                    : "hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 border-l-2 border-l-transparent"
                }`}
        >
            {children}
        </div>
    );
}

function ConditionsList({ conditions, onSelect, selectedId }: { conditions: ConditionSummary[]; onSelect: (c: ConditionSummary) => void; selectedId?: string }) {
    if (conditions.length === 0) {
        return <p className="text-[13px] text-zinc-400 dark:text-zinc-600 italic">No active conditions on record</p>;
    }
    return (
        <div className="bg-white dark:bg-zinc-800/30 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/40 divide-y divide-zinc-100 dark:divide-zinc-800">
            {conditions.map((c) => (
                <ClickableRow key={c.id} onClick={() => onSelect(c)} isSelected={selectedId === c.id}>
                    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                        <div className="min-w-0">
                            <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 leading-snug">{c.name}</p>
                            <p className="text-[11px] text-zinc-500 dark:text-zinc-500 mt-0.5">
                                {formatDate(c.onsetDate)}
                                {c.snomedCode && <span className="ml-2 font-mono text-zinc-400 dark:text-zinc-600">{c.snomedCode}</span>}
                            </p>
                        </div>
                        <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                            {c.clinicalStatus ?? "—"}
                        </span>
                    </div>
                </ClickableRow>
            ))}
        </div>
    );
}

function ProceduresList({ procedures, onSelect, selectedId }: { procedures: ProcedureSummary[]; onSelect: (p: ProcedureSummary) => void; selectedId?: string }) {
    if (procedures.length === 0) {
        return <p className="text-[13px] text-zinc-400 dark:text-zinc-600 italic">No procedures on record</p>;
    }
    return (
        <div className="bg-white dark:bg-zinc-800/30 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/40 divide-y divide-zinc-100 dark:divide-zinc-800">
            {procedures.map((p) => (
                <ClickableRow key={p.id} onClick={() => onSelect(p)} isSelected={selectedId === p.id}>
                    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                        <div className="min-w-0">
                            <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 leading-snug">{p.name}</p>
                            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">{formatDate(p.date)}</p>
                        </div>
                        <span className="shrink-0 text-[11px] font-mono text-zinc-400 dark:text-zinc-600">
                            {p.status ?? "—"}
                        </span>
                    </div>
                </ClickableRow>
            ))}
        </div>
    );
}

function MedicationsList({ medications, onSelect, selectedId }: { medications: MedicationSummary[]; onSelect: (m: MedicationSummary) => void; selectedId?: string }) {
    if (medications.length === 0) {
        return <p className="text-[13px] text-zinc-400 dark:text-zinc-600 italic">No medications on record</p>;
    }
    return (
        <div className="bg-white dark:bg-zinc-800/30 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/40 divide-y divide-zinc-100 dark:divide-zinc-800">
            {medications.map((m) => (
                <ClickableRow key={m.id} onClick={() => onSelect(m)} isSelected={selectedId === m.id}>
                    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 leading-snug">{m.name}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-[11px] text-zinc-500 dark:text-zinc-500">{formatDate(m.authoredOn)}</span>
                                {m.reason && (
                                    <>
                                        <span className="text-[11px] text-zinc-300 dark:text-zinc-600">·</span>
                                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{m.reason}</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full
                            ${m.status === "active"
                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}>
                            {m.status ?? "—"}
                        </span>
                    </div>
                </ClickableRow>
            ))}
        </div>
    );
}

function AllergiesList({ allergies, onSelect, selectedId }: { allergies: AllergySummary[]; onSelect: (a: AllergySummary) => void; selectedId?: string }) {
    if (allergies.length === 0) {
        return <p className="text-[13px] text-zinc-400 dark:text-zinc-600 italic">No known allergies</p>;
    }

    const criticalityColor = (crit: string | null) => {
        switch (crit) {
            case "high": return "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400";
            case "low": return "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400";
            default: return "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400";
        }
    };

    return (
        <div className="bg-white dark:bg-zinc-800/30 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/40 divide-y divide-zinc-100 dark:divide-zinc-800">
            {allergies.map((a) => (
                <ClickableRow key={a.id} onClick={() => onSelect(a)} isSelected={selectedId === a.id}>
                    <div className="px-5 py-3.5">
                        <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 leading-snug">{a.allergen}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    {a.category && <span className="text-[11px] text-zinc-500 capitalize">{a.category}</span>}
                                    {a.reaction && (
                                        <>
                                            <span className="text-[11px] text-zinc-300 dark:text-zinc-600">·</span>
                                            <span className="text-[11px] text-zinc-500">{a.reaction}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full ${criticalityColor(a.criticality)}`}>
                                {a.criticality ?? "—"}
                            </span>
                        </div>
                    </div>
                </ClickableRow>
            ))}
        </div>
    );
}

function EncountersList({ encounters, onSelect, selectedId }: { encounters: EncounterSummary[]; onSelect: (e: EncounterSummary) => void; selectedId?: string }) {
    if (encounters.length === 0) {
        return <p className="text-[13px] text-zinc-400 dark:text-zinc-600 italic">No encounters on record</p>;
    }

    const classLabel = (code: string | null) => {
        switch (code) {
            case "AMB": return "Ambulatory";
            case "IMP": return "Inpatient";
            case "EMER": return "Emergency";
            case "HH": return "Home Health";
            case "VR": return "Virtual";
            default: return code ?? "—";
        }
    };

    return (
        <div className="bg-white dark:bg-zinc-800/30 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/40 divide-y divide-zinc-100 dark:divide-zinc-800">
            {encounters.map((e) => (
                <ClickableRow key={e.id} onClick={() => onSelect(e)} isSelected={selectedId === e.id}>
                    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 leading-snug">{e.type}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-[11px] text-zinc-500 dark:text-zinc-500">{formatDate(e.startDate)}</span>
                                {e.provider && (
                                    <>
                                        <span className="text-[11px] text-zinc-300 dark:text-zinc-600">·</span>
                                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{e.provider}</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <span className="shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                            {classLabel(e.encounterClass)}
                        </span>
                    </div>
                </ClickableRow>
            ))}
        </div>
    );
}

// Pre-auth behavioral health screening codes
const BEHAVIORAL_HEALTH_CODES = new Set([
    "55757-9",   // PHQ-2
    "44249-1",   // PHQ-9
    "69737-5",   // GAD-7
    "72109-2",   // AUDIT-C
]);

function isBehavioralHealth(name: string, code: string | null) {
    if (code && BEHAVIORAL_HEALTH_CODES.has(code)) return true;
    const lower = name.toLowerCase();
    return lower.includes("phq") || lower.includes("gad") || lower.includes("audit")
        || lower.includes("depression") || lower.includes("anxiety")
        || lower.includes("mental") || lower.includes("psych");
}

function DiagnosticReportsList({ reports, onSelect, selectedId }: { reports: DiagnosticReportSummary[]; onSelect: (r: DiagnosticReportSummary) => void; selectedId?: string }) {
    if (reports.length === 0) {
        return <p className="text-[13px] text-zinc-400 dark:text-zinc-600 italic">No diagnostic reports on record</p>;
    }
    return (
        <div className="bg-white dark:bg-zinc-800/30 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/40 divide-y divide-zinc-100 dark:divide-zinc-800">
            {reports.map((r) => {
                const behavioral = isBehavioralHealth(r.name, r.loincCode);
                return (
                    <ClickableRow key={r.id} onClick={() => onSelect(r)} isSelected={selectedId === r.id}>
                        <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 leading-snug">{r.name}</p>
                                    {behavioral && (
                                        <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
                                            Psych Eval
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[11px] text-zinc-500 dark:text-zinc-500">{formatDate(r.date)}</span>
                                    {r.performer && (
                                        <>
                                            <span className="text-[11px] text-zinc-300 dark:text-zinc-600">·</span>
                                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{r.performer}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <span className="shrink-0 text-[11px] font-mono text-zinc-400 dark:text-zinc-600">
                                {r.status ?? "—"}
                            </span>
                        </div>
                    </ClickableRow>
                );
            })}
        </div>
    );
}

function ImmunizationsList({ immunizations, onSelect, selectedId }: { immunizations: ImmunizationSummary[]; onSelect: (i: ImmunizationSummary) => void; selectedId?: string }) {
    if (immunizations.length === 0) {
        return <p className="text-[13px] text-zinc-400 dark:text-zinc-600 italic">No immunizations on record</p>;
    }
    return (
        <div className="bg-white dark:bg-zinc-800/30 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/40 divide-y divide-zinc-100 dark:divide-zinc-800">
            {immunizations.map((i) => (
                <ClickableRow key={i.id} onClick={() => onSelect(i)} isSelected={selectedId === i.id}>
                    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200 leading-snug">{i.vaccine}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px] text-zinc-500 dark:text-zinc-500">{formatDate(i.date)}</span>
                                {i.location && (
                                    <>
                                        <span className="text-[11px] text-zinc-300 dark:text-zinc-600">·</span>
                                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{i.location}</span>
                                    </>
                                )}
                            </div>
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full
                            ${i.status === "completed"
                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                            }`}>
                            {i.status ?? "—"}
                        </span>
                    </div>
                </ClickableRow>
            ))}
        </div>
    );
}

// ─── Detail Panel ──────────────────────────────────────────────────────────

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
    if (!value) return null;
    return (
        <div className="py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-0.5">{label}</p>
            <p className="text-[13px] text-zinc-700 dark:text-zinc-200">{value}</p>
        </div>
    );
}

function DetailPanel({ item, onClose, width }: { item: DetailItem; onClose: () => void; width: number }) {
    const renderContent = () => {
        switch (item.type) {
            case "encounter": {
                const e = item.data;
                const classLabel = (code: string | null) => {
                    switch (code) { case "AMB": return "Ambulatory"; case "IMP": return "Inpatient"; case "EMER": return "Emergency"; case "HH": return "Home Health"; case "VR": return "Virtual"; default: return code ?? "—"; }
                };
                return (
                    <>
                        <h3 className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-100 mb-4">{e.type}</h3>
                        <DetailField label="Class" value={classLabel(e.encounterClass)} />
                        <DetailField label="Date" value={formatDate(e.startDate)} />
                        <DetailField label="End Date" value={formatDate(e.endDate)} />
                        <DetailField label="Provider" value={e.provider} />
                        <DetailField label="Location" value={e.location} />
                        <DetailField label="Organization" value={e.serviceProvider} />
                        <DetailField label="Reason" value={e.reasonDisplay} />
                        <DetailField label="Resource ID" value={e.id} />
                    </>
                );
            }
            case "report": {
                const r = item.data;
                return (
                    <>
                        <div className="flex items-center gap-2 mb-4">
                            <h3 className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-100">{r.name}</h3>
                            {isBehavioralHealth(r.name, r.loincCode) && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400">
                                    Psych Eval
                                </span>
                            )}
                        </div>
                        <DetailField label="Status" value={r.status} />
                        <DetailField label="Date" value={formatDate(r.date)} />
                        <DetailField label="Category" value={r.category} />
                        <DetailField label="Performer" value={r.performer} />
                        <DetailField label="LOINC Code" value={r.loincCode} />
                        {r.results.length > 0 && (
                            <div className="py-2 border-b border-zinc-100 dark:border-zinc-800">
                                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-1">Results</p>
                                {r.results.map((res, i) => (
                                    <p key={i} className="text-[13px] text-zinc-700 dark:text-zinc-200 py-0.5">{res.display}</p>
                                ))}
                            </div>
                        )}
                        {r.noteContent && (
                            <div className="pt-3">
                                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-2">Clinical Note</p>
                                <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200/60 dark:border-zinc-700/30 px-4 py-3 max-h-[400px] overflow-y-auto">
                                    <pre className="text-[12px] text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap font-sans">
                                        {r.noteContent}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </>
                );
            }
            case "medication": {
                const m = item.data;
                return (
                    <>
                        <h3 className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-100 mb-4">{m.name}</h3>
                        <DetailField label="Status" value={m.status} />
                        <DetailField label="Prescribed On" value={formatDate(m.authoredOn)} />
                        <DetailField label="Reason" value={m.reason} />
                        <DetailField label="RxNorm Code" value={m.rxNormCode} />
                        <DetailField label="Resource ID" value={m.id} />
                    </>
                );
            }
            case "allergy": {
                const a = item.data;
                return (
                    <>
                        <h3 className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-100 mb-4">{a.allergen}</h3>
                        <DetailField label="Clinical Status" value={a.clinicalStatus} />
                        <DetailField label="Category" value={a.category} />
                        <DetailField label="Criticality" value={a.criticality} />
                        <DetailField label="Reaction" value={a.reaction} />
                        <DetailField label="Severity" value={a.severity} />
                        <DetailField label="Recorded Date" value={formatDate(a.recordedDate)} />
                        <DetailField label="Resource ID" value={a.id} />
                    </>
                );
            }
            case "condition": {
                const c = item.data;
                return (
                    <>
                        <h3 className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-100 mb-4">{c.name}</h3>
                        <DetailField label="Clinical Status" value={c.clinicalStatus} />
                        <DetailField label="Onset Date" value={formatDate(c.onsetDate)} />
                        <DetailField label="SNOMED Code" value={c.snomedCode} />
                        <DetailField label="Resource ID" value={c.id} />
                    </>
                );
            }
            case "procedure": {
                const p = item.data;
                return (
                    <>
                        <h3 className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-100 mb-4">{p.name}</h3>
                        <DetailField label="Status" value={p.status} />
                        <DetailField label="Date" value={formatDate(p.date)} />
                        <DetailField label="Resource ID" value={p.id} />
                    </>
                );
            }
            case "immunization": {
                const i = item.data;
                return (
                    <>
                        <h3 className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-100 mb-4">{i.vaccine}</h3>
                        <DetailField label="Status" value={i.status} />
                        <DetailField label="Date" value={formatDate(i.date)} />
                        <DetailField label="Location" value={i.location} />
                        <DetailField label="Resource ID" value={i.id} />
                    </>
                );
            }
            case "vital": {
                const v = item.data;
                if (v.loading) {
                    return (
                        <div className="flex items-center gap-3 py-8 justify-center">
                            <svg className="animate-spin w-5 h-5 text-zinc-300" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            <span className="text-[13px] text-zinc-400">Loading history…</span>
                        </div>
                    );
                }
                return (
                    <>
                        <h3 className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-100 mb-1">{v.name}</h3>
                        <p className="text-[11px] text-zinc-400 mb-4">{v.points.length} readings · LOINC {v.loincCode}</p>

                        {/* Chart */}
                        <div className="mb-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200/60 dark:border-zinc-700/30 p-3">
                            <VitalChart points={v.points} accent={v.accent} unit={v.unit} />
                        </div>

                        {/* Stats */}
                        {v.points.length > 0 && (
                            <div className="grid grid-cols-3 gap-3 mb-4">
                                {(() => {
                                    const vals = v.points.map(p => p.value);
                                    const min = Math.min(...vals);
                                    const max = Math.max(...vals);
                                    const avg = vals.reduce((s, x) => s + x, 0) / vals.length;
                                    return (
                                        <>
                                            <div className="text-center py-2 bg-zinc-50 dark:bg-zinc-800/30 rounded-lg">
                                                <p className="text-[10px] text-zinc-400 uppercase tracking-widest">Min</p>
                                                <p className="text-[15px] font-semibold text-zinc-700 dark:text-zinc-200">{min.toFixed(1)}</p>
                                            </div>
                                            <div className="text-center py-2 bg-zinc-50 dark:bg-zinc-800/30 rounded-lg">
                                                <p className="text-[10px] text-zinc-400 uppercase tracking-widest">Avg</p>
                                                <p className="text-[15px] font-semibold text-zinc-700 dark:text-zinc-200">{avg.toFixed(1)}</p>
                                            </div>
                                            <div className="text-center py-2 bg-zinc-50 dark:bg-zinc-800/30 rounded-lg">
                                                <p className="text-[10px] text-zinc-400 uppercase tracking-widest">Max</p>
                                                <p className="text-[15px] font-semibold text-zinc-700 dark:text-zinc-200">{max.toFixed(1)}</p>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        )}

                        {/* History table */}
                        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-2">History</p>
                        <div className="space-y-0 divide-y divide-zinc-100 dark:divide-zinc-800">
                            {[...v.points].reverse().map((p, i) => (
                                <div key={i} className="flex items-center justify-between py-1.5">
                                    <span className="text-[12px] text-zinc-500">{formatDate(p.date)}</span>
                                    <span className={`text-[13px] font-semibold ${v.accent}`}>
                                        {p.value.toFixed(p.value % 1 ? 1 : 0)}
                                        <span className="text-[10px] font-normal text-zinc-400 ml-0.5">{p.unit}</span>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                );
            }
            case "document": {
                const doc = item.data;
                return (
                    <>
                        <h3 className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-100 mb-4">{doc.type}</h3>
                        <DetailField label="Date" value={formatDate(doc.date)} />
                        <DetailField label="Author" value={doc.author} />
                        <DetailField label="Status" value={doc.status} />
                        <DetailField label="Category" value={doc.category} />
                        <DetailField label="Encounter" value={doc.encounterRef} />
                        {doc.contentPreview && (
                            <div className="py-2 border-b border-zinc-100 dark:border-zinc-800">
                                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest mb-1">Note Preview</p>
                                <pre className="text-[12px] text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-3 max-h-96 overflow-y-auto">
                                    {doc.contentPreview}
                                </pre>
                            </div>
                        )}
                        <DetailField label="Resource ID" value={doc.id} />
                    </>
                );
            }
            case "device": {
                const dev = item.data;
                return (
                    <>
                        <h3 className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-100 mb-4">{dev.name}</h3>
                        {dev.eligibilityTag && (
                            <div className="mb-4 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20">
                                <p className="text-[12px] font-semibold text-blue-700 dark:text-blue-400">★ {dev.eligibilityTag}</p>
                                <p className="text-[11px] text-blue-600/70 dark:text-blue-400/60 mt-0.5">This device may support bariatric surgery pre-authorization</p>
                            </div>
                        )}
                        <DetailField label="Status" value={dev.status} />
                        <DetailField label="SNOMED Code" value={dev.snomedCode} />
                        <DetailField label="Manufacturer" value={dev.manufacturer} />
                        <DetailField label="Expiration Date" value={formatDate(dev.expirationDate)} />
                        <DetailField label="Resource ID" value={dev.id} />
                    </>
                );
            }
        }
    };

    const typeLabels: Record<DetailItem["type"], string> = {
        encounter: "Encounter Detail",
        report: "Diagnostic Report",
        medication: "Medication Detail",
        allergy: "Allergy Detail",
        condition: "Condition Detail",
        procedure: "Procedure Detail",
        immunization: "Immunization Detail",
        vital: "Vital Sign Trend",
        document: "Clinical Document",
        device: "Device Detail",
    };

    return (
        <aside
            style={{ width: `${width}px` }}
            className="shrink-0 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 flex flex-col h-full animate-slideIn"
        >
            {/* Panel header */}
            <div className="px-5 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">{typeLabels[item.type]}</p>
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
                {renderContent()}
            </div>
        </aside>
    );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function ClinicalSnapshotView({ patientId }: ClinicalSnapshotProps) {
    const [snapshot, setSnapshot] = useState<ClinicalSnapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aiSummary, setAiSummary] = useState<AIReview | null>(null);
    const [aiLoading, setAiLoading] = useState(false);
    const [detailItem, setDetailItem] = useState<DetailItem | null>(null);
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
            setSnapshot(null);
            setDetailItem(null);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);
        setDetailItem(null);

        fetch(`/api/patients/${patientId}`)
            .then((res) => {
                if (!res.ok) throw new Error("Failed to load patient");
                return res.json();
            })
            .then((data: ClinicalSnapshot) => {
                if (!cancelled) setSnapshot(data);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, [patientId]);

    // Auto-fetch AI clinical summary
    useEffect(() => {
        if (!patientId) {
            setAiSummary(null);
            return;
        }
        let cancelled = false;
        setAiLoading(true);
        fetch(`/api/patients/${patientId}/ai-review`, { method: "POST" })
            .then(res => res.ok ? res.json() : null)
            .then((data: AIReview | null) => {
                if (!cancelled && data) setAiSummary(data);
            })
            .catch(() => { })
            .finally(() => { if (!cancelled) setAiLoading(false); });
        return () => { cancelled = true; };
    }, [patientId]);

    // ─── Empty state ──────────────────────────────────────────────────────
    if (!patientId) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <div className="text-5xl mb-4 opacity-20">🏥</div>
                    <p className="text-zinc-400 dark:text-zinc-500 text-lg font-medium">Select a patient</p>
                    <p className="text-zinc-300 dark:text-zinc-600 text-sm mt-1">
                        Choose from the list to view their clinical snapshot
                    </p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="flex items-center gap-3 text-zinc-400">
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Loading clinical data…</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <p className="text-red-500 font-medium">{error}</p>
                    <button
                        onClick={() => setLoading(true)}
                        className="mt-2 text-sm text-blue-500 hover:underline"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (!snapshot) return null;

    const { patient, activeConditions, recentProcedures, keyObservations, medications, allergies, encounters, diagnosticReports, immunizations, documentReferences, devices } = snapshot;

    const selectedId = detailItem ? (detailItem.data as { id: string }).id : undefined;

    return (
        <div ref={containerRef} className="flex h-full">
            {/* Main scroll area */}
            <div className="flex-1 min-w-0 h-full overflow-y-auto">
                <div className="px-5 py-5 space-y-6">
                    {/* ── Patient Header ── */}
                    <header>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h1 className="text-[26px] font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight leading-tight">
                                    {patient.name}
                                </h1>
                                <div className="flex items-center gap-2 mt-1.5 text-[13px] text-zinc-600 dark:text-zinc-400">
                                    <span className="capitalize">{patient.gender}</span>
                                    <span className="text-zinc-300 dark:text-zinc-600">·</span>
                                    <span>{patient.age !== null ? `${patient.age} years` : "Age unknown"}</span>
                                    {patient.birthDate && (
                                        <>
                                            <span className="text-zinc-300 dark:text-zinc-600">·</span>
                                            <span>DOB {formatDate(patient.birthDate)}</span>
                                        </>
                                    )}
                                </div>
                                {(patient.address || patient.race || patient.ethnicity) && (
                                    <p className="text-[13px] text-zinc-500 dark:text-zinc-500 mt-1 leading-relaxed">
                                        {[patient.address, [patient.race, patient.ethnicity].filter(Boolean).join(" · ")].filter(Boolean).join("  ·  ")}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 mt-1">
                                {patient.deceased && (
                                    <span className="px-2.5 py-1 text-[11px] font-medium rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                                        Deceased
                                    </span>
                                )}
                                <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 tracking-tight">
                                    {patient.id.slice(0, 8)}
                                </span>
                            </div>
                        </div>
                    </header>

                    {/* ── Clinical Summary ── */}
                    <section className="bg-white dark:bg-zinc-800/30 border border-zinc-200/80 dark:border-zinc-800 rounded-2xl px-5 py-4">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-500 uppercase tracking-widest">
                                Clinical Summary
                            </h2>
                            {aiSummary?.source === "fallback" ? (
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 font-medium">
                                    Rule-based
                                </span>
                            ) : aiSummary ? (
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                                    AI-generated
                                </span>
                            ) : null}
                        </div>
                        {aiLoading ? (
                            <div className="flex items-center gap-2.5 py-1">
                                <svg className="animate-spin w-3.5 h-3.5 text-zinc-300" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                <span className="text-[13px] text-zinc-400">Writing summary…</span>
                            </div>
                        ) : aiSummary ? (
                            <p className="text-[13px] text-zinc-600 dark:text-zinc-300 leading-[1.75]">{aiSummary.clinicalSummary}</p>
                        ) : (
                            <p className="text-[13px] text-zinc-400 italic">Summary unavailable</p>
                        )}
                    </section>

                    {/* ── Key Vitals ── */}
                    <CollapsibleSection title="Key Vitals">
                        {(() => {
                            const vitals: { label: string; obs: ObservationSummary | null; accent: string; loincCode: string }[] = [
                                { label: "BMI", obs: keyObservations.bmi, accent: "text-blue-600 dark:text-blue-400", loincCode: "39156-5" },
                                { label: "Systolic BP", obs: keyObservations.bloodPressureSystolic, accent: "text-rose-600 dark:text-rose-400", loincCode: "8480-6" },
                                { label: "Diastolic BP", obs: keyObservations.bloodPressureDiastolic, accent: "text-rose-500 dark:text-rose-400", loincCode: "8462-4" },
                                { label: "Heart Rate", obs: keyObservations.heartRate, accent: "text-purple-600 dark:text-purple-400", loincCode: "8867-4" },
                                { label: "Body Weight", obs: keyObservations.bodyWeight, accent: "text-emerald-600 dark:text-emerald-400", loincCode: "29463-7" },
                            ];

                            const handleVitalClick = async (label: string, accent: string, loincCode: string) => {
                                // Show loading state immediately
                                setDetailItem({ type: "vital", data: { name: label, loincCode, unit: "", points: [], accent, loading: true } });

                                try {
                                    const res = await fetch(`/api/patients/${patientId}/observations?code=${loincCode}&limit=50`);
                                    if (!res.ok) throw new Error("Failed to fetch");
                                    const data = await res.json();
                                    setDetailItem({ type: "vital", data: { ...data, accent, loading: false } });
                                } catch {
                                    setDetailItem({ type: "vital", data: { name: label, loincCode, unit: "", points: [], accent, loading: false } });
                                }
                            };

                            return (
                                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
                                    {vitals.map((v) => (
                                        <VitalCard
                                            key={v.loincCode}
                                            label={v.label}
                                            observation={v.obs}
                                            accent={v.accent}
                                            onClick={v.obs ? () => handleVitalClick(v.label, v.accent, v.loincCode) : undefined}
                                            isSelected={detailItem?.type === "vital" && detailItem.data.loincCode === v.loincCode}
                                        />
                                    ))}
                                </div>
                            );
                        })()}
                    </CollapsibleSection>

                    {/* ── Allergies ── */}
                    <CollapsibleSection
                        title="Allergies"
                        count={allergies.length}
                        badge={allergies.length === 0 ? <span className="text-[10px] font-medium text-emerald-500 normal-case tracking-normal">NKDA</span> : undefined}
                    >
                        <AllergiesList allergies={allergies} onSelect={(a) => setDetailItem({ type: "allergy", data: a })} selectedId={selectedId} />
                    </CollapsibleSection>

                    {/* ── Medications ── */}
                    <CollapsibleSection title="Medications" count={medications.length}>
                        <MedicationsList medications={medications} onSelect={(m) => setDetailItem({ type: "medication", data: m })} selectedId={selectedId} />
                    </CollapsibleSection>

                    {/* ── Active Conditions ── */}
                    <CollapsibleSection title="Active Conditions" count={activeConditions.length}>
                        <ConditionsList conditions={activeConditions} onSelect={(c) => setDetailItem({ type: "condition", data: c })} selectedId={selectedId} />
                    </CollapsibleSection>

                    {/* ── Diagnostic Reports ── */}
                    <CollapsibleSection title="Diagnostic Reports" count={diagnosticReports.length}>
                        <DiagnosticReportsList reports={diagnosticReports} onSelect={(r) => setDetailItem({ type: "report", data: r })} selectedId={selectedId} />
                    </CollapsibleSection>

                    {/* ── Encounters ── */}
                    <CollapsibleSection title="Recent Encounters" count={encounters.length}>
                        <EncountersList encounters={encounters} onSelect={(e) => setDetailItem({ type: "encounter", data: e })} selectedId={selectedId} />
                    </CollapsibleSection>

                    {/* ── Procedures ── */}
                    <CollapsibleSection title="Recent Procedures" count={recentProcedures.length}>
                        <ProceduresList procedures={recentProcedures} onSelect={(p) => setDetailItem({ type: "procedure", data: p })} selectedId={selectedId} />
                    </CollapsibleSection>

                    {/* ── Immunizations ── */}
                    <CollapsibleSection title="Immunizations" count={immunizations.length}>
                        <ImmunizationsList immunizations={immunizations} onSelect={(i) => setDetailItem({ type: "immunization", data: i })} selectedId={selectedId} />
                    </CollapsibleSection>

                    {/* ── Clinical Documents ── */}
                    <CollapsibleSection title="Clinical Documents" count={documentReferences.length}>
                        <div className="space-y-1">
                            {documentReferences.map((doc) => (
                                <ClickableRow
                                    key={doc.id}
                                    onClick={() => setDetailItem({ type: "document", data: doc })}
                                    isSelected={selectedId === doc.id}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="shrink-0 w-6 h-6 rounded-md bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center">
                                            <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                            </svg>
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-200 truncate">{doc.type}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-[11px] text-zinc-400">{formatDate(doc.date)}</span>
                                                {doc.author && <span className="text-[11px] text-zinc-400 truncate">· {doc.author}</span>}
                                            </div>
                                        </div>
                                    </div>
                                </ClickableRow>
                            ))}
                        </div>
                    </CollapsibleSection>

                    {/* ── Medical Devices ── */}
                    <CollapsibleSection title="Medical Devices" count={devices.length}>
                        <div className="space-y-1">
                            {devices.map((dev) => (
                                <ClickableRow
                                    key={dev.id}
                                    onClick={() => setDetailItem({ type: "device", data: dev })}
                                    isSelected={selectedId === dev.id}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="shrink-0 w-6 h-6 rounded-md bg-teal-50 dark:bg-teal-500/10 flex items-center justify-center">
                                            <svg className="w-3.5 h-3.5 text-teal-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.384-3.11A1.5 1.5 0 015 10.74V6a1.5 1.5 0 011.036-1.424l5-1.667a1.5 1.5 0 01.928 0l5 1.667A1.5 1.5 0 0118 6v4.74a1.5 1.5 0 01-1.036 1.32l-5.384 3.11a1.5 1.5 0 01-1.16 0z" />
                                            </svg>
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[13px] font-medium text-zinc-700 dark:text-zinc-200 truncate">{dev.name}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${dev.status === "active"
                                                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                                                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                                                    }`}>{dev.status}</span>
                                                {dev.eligibilityTag && (
                                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                                                        ★ {dev.eligibilityTag}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </ClickableRow>
                            ))}
                        </div>
                    </CollapsibleSection>
                </div>
            </div>

            {/* ── Drag Handle + Detail Panel (Third Pane) ── */}
            {detailItem && (
                <>
                    <div
                        onMouseDown={handleMouseDown}
                        className="w-1.5 h-full cursor-col-resize bg-transparent hover:bg-blue-400/30 active:bg-blue-500/40 transition-colors flex items-center justify-center shrink-0 group"
                    >
                        <div className="w-0.5 h-8 rounded-full bg-zinc-300 dark:bg-zinc-600 group-hover:bg-blue-400 transition-colors" />
                    </div>
                    <DetailPanel item={detailItem} onClose={() => setDetailItem(null)} width={detailWidth} />
                </>
            )}
        </div>
    );
}
