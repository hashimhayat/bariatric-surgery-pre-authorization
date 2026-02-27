"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import PatientList from "@/components/PatientList";
import ClinicalSnapshotView from "@/components/ClinicalSnapshot";
import Timeline from "@/components/Timeline";
import EligibilityPanel from "@/components/EligibilityPanel";
import CohortReportPanel from "@/components/CohortReport";
import { EligibilityStatus } from "@/types/fhir";

type Tab = "snapshot" | "timeline" | "eligibility" | "report";

// ─── Animated particle canvas ───────────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const init = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const palette = [
      'rgba(0,122,255,',   // blue
      'rgba(88,86,214,',   // indigo
      'rgba(175,82,222,',  // purple
      'rgba(50,215,75,',   // green
      'rgba(0,199,190,',   // teal
      'rgba(255,55,95,',   // pink
      'rgba(255,149,0,',   // orange
      'rgba(90,200,250,',  // cyan
    ];

    const count = 55;
    const particles = Array.from({ length: count }, () => {
      const w = window.innerWidth, h = window.innerHeight;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 3.5 + 1.5,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        color: palette[Math.floor(Math.random() * palette.length)],
        alpha: Math.random() * 0.35 + 0.08,
        pulseSpeed: Math.random() * 0.008 + 0.003,
        pulseOffset: Math.random() * Math.PI * 2,
      };
    });

    let t = 0;
    const draw = () => {
      const w = window.innerWidth, h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      t++;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        // wrap around edges
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        const pulse = Math.sin(t * p.pulseSpeed + p.pulseOffset) * 0.15 + 0.85;
        const a = p.alpha * pulse;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * pulse, 0, Math.PI * 2);
        ctx.fillStyle = p.color + a.toFixed(3) + ')';
        ctx.fill();

        // soft glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = p.color + (a * 0.15).toFixed(3) + ')';
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => {
    const cleanup = init();
    return cleanup;
  }, [init]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 1 }}
    />
  );
}

// ─── Splash / Welcome Screen ────────────────────────────────────────────────
function WelcomeScreen({ onEnter }: { onEnter: () => void }) {
  return (
    <div
      className="overflow-y-auto select-none"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, sans-serif',
        background: '#FBFBFD',
        height: '100vh',
        scrollBehavior: 'smooth',
      }}
    >
      <style>{`
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes line-draw {
          from { width: 0; }
          to { width: 64px; }
        }
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(6px); }
        }
      `}</style>

      {/* ── Section 1: Hero ── */}
      <section
        className="relative flex flex-col items-center justify-center"
        style={{ minHeight: '100vh' }}
      >
        {/* Particle animation */}
        <ParticleCanvas />

        {/* Radial wash */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 2,
            background: 'radial-gradient(ellipse 70% 50% at 50% 40%, rgba(0,122,255,0.025) 0%, transparent 70%)',
          }}
        />

        {/* Content */}
        <div className="relative text-center max-w-lg px-6 flex-1 flex flex-col items-center justify-center" style={{ zIndex: 10 }}>
          {/* Gradient accent */}
          <div style={{ marginBottom: 40, animation: 'fade-up 0.8s ease-out 0.2s both' }}>
            <div
              className="mx-auto rounded-full"
              style={{
                height: 4,
                width: 64,
                borderRadius: 2,
                background: 'linear-gradient(90deg, #007AFF, #5856D6, #AF52DE, #007AFF)',
                backgroundSize: '200% 100%',
                animation: 'line-draw 1s ease-out 0.3s both, gradient-shift 4s linear 1.3s infinite',
              }}
            />
          </div>

          <p
            style={{
              fontSize: 13, fontWeight: 600, letterSpacing: '0.08em',
              color: '#86868B', animation: 'fade-up 0.8s ease-out 0.5s both',
              textTransform: 'uppercase' as const,
            }}
          >
            Autonomy Health
          </p>

          <h1
            style={{
              marginTop: 12, fontSize: 56, fontWeight: 600,
              letterSpacing: '-0.025em', lineHeight: 1.05,
              color: '#1D1D1F', animation: 'fade-up 0.8s ease-out 0.7s both',
            }}
          >
            Prior Authorization.
          </h1>

          <p
            style={{
              marginTop: 16, fontSize: 21, lineHeight: 1.4,
              fontWeight: 400, color: '#6E6E73',
              animation: 'fade-up 0.8s ease-out 0.9s both',
            }}
          >
            <span style={{ background: 'linear-gradient(90deg, #007AFF, #5856D6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Bariatric surgery</span>, streamlined.
          </p>

          <p
            style={{
              marginTop: 12, fontSize: 14, lineHeight: 1.5,
              color: '#AEAEB2', animation: 'fade-up 0.8s ease-out 1.0s both',
            }}
          >
            Review every patient against payer criteria —<br />
            BMI, comorbidities, prior interventions, behavioral health.
          </p>

          {/* CTA */}
          <div style={{ marginTop: 40, animation: 'fade-up 0.8s ease-out 1.2s both' }}>
            <button
              onClick={onEnter}
              className="cursor-pointer transition-all duration-300"
              style={{
                padding: '16px 36px', background: '#007AFF', color: '#fff',
                borderRadius: 980, fontSize: 17, fontWeight: 400,
                letterSpacing: '-0.01em', border: 'none',
                boxShadow: '0 1px 4px rgba(0,122,255,0.2)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#0071EB';
                e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,122,255,0.25)';
                e.currentTarget.style.transform = 'scale(1.015)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#007AFF';
                e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,122,255,0.2)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              Get Started
            </button>
          </div>

          <p style={{ marginTop: 20, animation: 'fade-up 0.8s ease-out 1.4s both' }}>
            <a
              href="https://www.autonomyhealth.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors duration-200"
              style={{ color: '#007AFF', fontSize: 14 }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#0071EB')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#007AFF')}
            >
              autonomyhealth.io →
            </a>
          </p>
        </div>

        {/* Scroll indicator */}
        <a
          href="#about"
          className="relative z-10 flex flex-col items-center gap-2 pb-8 transition-opacity duration-300 hover:opacity-70"
          style={{ animation: 'fade-up 0.8s ease-out 1.6s both', textDecoration: 'none' }}
        >
          <span style={{ fontSize: 12, color: '#AEAEB2', letterSpacing: '0.02em' }}>Learn more</span>
          <svg
            width="16" height="16" viewBox="0 0 16 16" fill="none"
            style={{ animation: 'float 2s ease-in-out infinite' }}
          >
            <path d="M4 6l4 4 4-4" stroke="#AEAEB2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </section>

      {/* ── Section 2: About & Footer ── */}
      <section
        id="about"
        style={{
          background: '#F5F5F7',
          padding: '80px 40px 48px',
        }}
      >
        <div className="max-w-4xl mx-auto">
          {/* Section heading */}
          <p style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.06em', color: '#86868B', textTransform: 'uppercase' as const, textAlign: 'center' }}>
            How it works
          </p>
          <h2 style={{ marginTop: 12, fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', color: '#1D1D1F', textAlign: 'center', lineHeight: 1.2 }}>
            Prior auth, simplified.
          </h2>
          <p style={{ marginTop: 12, fontSize: 17, color: '#6E6E73', textAlign: 'center', lineHeight: 1.5, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
            Evaluate bariatric surgery pre-authorization across your patient panel
            with deterministic payer criteria and AI-assisted clinical review.
          </p>

          {/* Three columns */}
          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
            style={{ marginTop: 48 }}
          >
            {[
              {
                title: 'Eligibility Engine',
                desc: 'Deterministic evaluation of BMI thresholds, comorbidity requirements, documented prior weight-loss attempts, and behavioral health assessments — all sourced directly from FHIR R4 records.',
              },
              {
                title: 'AI Clinical Review',
                desc: 'AI-generated summaries highlight key findings, flag missing documentation, and suggest next steps — grounded entirely in the patient\'s own clinical data.',
              },
              {
                title: 'Cohort Analytics',
                desc: 'Population-level views of eligibility distribution, common disqualifiers, and patients ready for prior authorization — across your entire panel at a glance.',
              },
            ].map((item) => (
              <div
                key={item.title}
                style={{
                  background: '#FFFFFF',
                  borderRadius: 16,
                  padding: '32px 28px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <h3 style={{ fontSize: 17, fontWeight: 600, color: '#1D1D1F', letterSpacing: '-0.01em' }}>
                  {item.title}
                </h3>
                <p style={{ marginTop: 8, fontSize: 14, color: '#86868B', lineHeight: 1.6 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Standards bar */}
          <div
            className="flex flex-wrap justify-center gap-x-8 gap-y-2"
            style={{ marginTop: 56, fontSize: 12, color: '#AEAEB2' }}
          >
            <span>FHIR R4</span>
            <span>HL7 International</span>
            <span>Synthea Synthetic Data</span>
            <span>OpenAI Integration</span>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '32px 0' }} />

          {/* Footer columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8" style={{ fontSize: 13, color: '#86868B' }}>
            <div>
              <p style={{ fontWeight: 600, color: '#1D1D1F', marginBottom: 8 }}>Product</p>
              <p style={{ lineHeight: 2 }}>Eligibility Review</p>
              <p style={{ lineHeight: 2 }}>Clinical Snapshots</p>
              <p style={{ lineHeight: 2 }}>Patient Timeline</p>
              <p style={{ lineHeight: 2 }}>Cohort Reports</p>
            </div>
            <div>
              <p style={{ fontWeight: 600, color: '#1D1D1F', marginBottom: 8 }}>Standards</p>
              <p style={{ lineHeight: 2 }}>FHIR R4 Compliance</p>
              <p style={{ lineHeight: 2 }}>HL7 Interoperability</p>
              <p style={{ lineHeight: 2 }}>Deterministic Logic</p>
              <p style={{ lineHeight: 2 }}>AI Grounding Validation</p>
            </div>
            <div>
              <p style={{ fontWeight: 600, color: '#1D1D1F', marginBottom: 8 }}>Company</p>
              <a href="https://www.autonomyhealth.io/" target="_blank" rel="noopener noreferrer" style={{ display: 'block', lineHeight: 2, color: '#007AFF' }}>autonomyhealth.io</a>
              <p style={{ lineHeight: 2 }}>Clinical Decision Support</p>
              <p style={{ lineHeight: 2 }}>Healthcare Technology</p>
              <p style={{ lineHeight: 2 }}>Assessment Project</p>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'rgba(0,0,0,0.06)', margin: '32px 0 24px' }} />

          {/* Disclaimer */}
          <p style={{ fontSize: 11, color: '#C7C7CC', lineHeight: 1.7, textAlign: 'center', maxWidth: 640, marginLeft: 'auto', marginRight: 'auto' }}>
            This application is a technical assessment demonstrating automated prior
            authorization review for bariatric surgery candidates. Patient records are
            synthetically generated using Synthea and do not represent real individuals.
            Eligibility determinations are for demonstration purposes only and are not
            intended to inform clinical decisions or replace professional medical judgment.
          </p>

          {/* Copyright */}
          <p style={{ marginTop: 16, fontSize: 11, color: '#D2D2D7', textAlign: 'center' }}>
            © {new Date().getFullYear()} Autonomy Health, Inc. All rights reserved.
          </p>
        </div>
      </section>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────

export default function Home() {
  const [showPortal, setShowPortal] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("report");
  const [eligibilityFilter, setEligibilityFilter] = useState<EligibilityStatus | "all">("all");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  if (!showPortal) {
    return <WelcomeScreen onEnter={() => setShowPortal(true)} />;
  }

  const patientTabs: { key: Tab; label: string }[] = [
    { key: "snapshot", label: "Snapshot" },
    { key: "timeline", label: "Timeline" },
    { key: "eligibility", label: "Eligibility" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-zinc-950">
      {/* Sidebar — Patient List */}
      <aside className="w-80 xl:w-96 shrink-0 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex flex-col">
        <div className="px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-800">
          {/* Top bar — brand + actions */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Autonomy Health
              </p>
              <h1 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight leading-snug">
                Prior Authorization
              </h1>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => {
                  setSelectedPatientId(null);
                  setActiveTab("report");
                }}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${activeTab === "report" && !selectedPatientId
                  ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
                  : "text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                title="Cohort Report"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </button>
              {/* Theme toggle */}
              <button
                onClick={() => setIsDark(!isDark)}
                className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title={isDark ? 'Light Mode' : 'Dark Mode'}
              >
                {isDark ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                  </svg>
                )}
              </button>
              {/* Exit */}
              <button
                onClick={() => {
                  setShowPortal(false);
                  setSelectedPatientId(null);
                  setActiveTab("report");
                }}
                className="p-1.5 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors cursor-pointer"
                title="Exit Portal"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                </svg>
              </button>
            </div>
          </div>
          {/* Descriptor */}
          <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
            Bariatric surgery pre-authorization
          </p>
        </div>
        <PatientList
          selectedId={selectedPatientId}
          eligibilityFilter={eligibilityFilter}
          onEligibilityFilterChange={setEligibilityFilter}
          onSelect={(id) => {
            setSelectedPatientId(id);
            if (activeTab === "report") setActiveTab("snapshot");
          }}
        />
      </aside>

      {/* Main Panel */}
      <main className="flex-1 min-w-0 bg-white dark:bg-zinc-900/50 flex flex-col">
        {/* Tabs — show patient tabs when a patient is selected */}
        {selectedPatientId && (
          <div className="border-b border-zinc-200 dark:border-zinc-800 px-6 flex gap-0">
            {patientTabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer
                  ${activeTab === key
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Tab content */}
        <div className="flex-1 min-h-0">
          {activeTab === "report" || !selectedPatientId ? (
            <CohortReportPanel />
          ) : activeTab === "snapshot" ? (
            <ClinicalSnapshotView patientId={selectedPatientId} />
          ) : activeTab === "timeline" ? (
            <Timeline patientId={selectedPatientId} />
          ) : (
            <EligibilityPanel patientId={selectedPatientId} />
          )}
        </div>
      </main>
    </div>
  );
}
