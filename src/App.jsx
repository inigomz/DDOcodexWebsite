import React, { useState, useCallback } from 'react';
import PlannerForm from './components/PlannerForm.jsx';
import GearResults from './components/GearResults.jsx';
import AdvisorReport from './components/AdvisorReport.jsx';
import styles from './App.module.css';

const PLAN_GEAR_URL = '/.netlify/functions/planGear';
const ADVISOR_URL = '/.netlify/functions/advisor';

export default function App() {
  const [planState, setPlanState] = useState('idle'); // idle | loading | done | error
  const [advisorState, setAdvisorState] = useState('idle'); // idle | loading | done | error
  const [summary, setSummary] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [planError, setPlanError] = useState(null);
  const [advisorError, setAdvisorError] = useState(null);

  const handlePlan = useCallback(async (goal) => {
    setPlanState('loading');
    setSummary(null);
    setAdvice(null);
    setPlanError(null);
    setAdvisorState('idle');
    setAdvisorError(null);

    try {
      const res = await fetch(PLAN_GEAR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Server error ${res.status}`);
      }

      setSummary(data.summary);
      setPlanState('done');
    } catch (err) {
      setPlanError(err.message);
      setPlanState('error');
    }
  }, []);

  const handleGetAdvice = useCallback(async () => {
    if (!summary) return;

    setAdvisorState('loading');
    setAdvice(null);
    setAdvisorError(null);

    try {
      const res = await fetch(ADVISOR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Server error ${res.status}`);
      }

      setAdvice(data.advice);
      setAdvisorState('done');
    } catch (err) {
      setAdvisorError(err.message);
      setAdvisorState('error');
    }
  }, [summary]);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>⚔</span>
            <span className={styles.logoText}>DDO Codex</span>
            <span className={styles.logoBadge}>Gear Planner</span>
          </div>
          <p className={styles.tagline}>
            AI-powered gear optimization for Dungeons &amp; Dragons Online
          </p>
        </div>
      </header>

      <main className={styles.main}>
        <PlannerForm
          onSubmit={handlePlan}
          isLoading={planState === 'loading'}
        />

        {planState === 'error' && (
          <div className={styles.errorBanner} role="alert">
            <strong>Planning failed:</strong> {planError}
          </div>
        )}

        {planState === 'loading' && (
          <div className={styles.loadingBanner} aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            Running gear planner — searching items, scoring augments, validating build…
          </div>
        )}

        {planState === 'done' && summary && (
          <>
            <GearResults
              summary={summary}
              onGetAdvice={handleGetAdvice}
              advisorState={advisorState}
            />

            {advisorState === 'error' && (
              <div className={styles.errorBanner} role="alert">
                <strong>Advisor failed:</strong> {advisorError}
              </div>
            )}

            {advisorState === 'done' && advice && (
              <AdvisorReport advice={advice} />
            )}
          </>
        )}
      </main>

      <footer className={styles.footer}>
        <p>
          Data sourced from{' '}
          <a href="https://ddowiki.com" target="_blank" rel="noopener noreferrer">
            DDO Wiki
          </a>
          . Not affiliated with Standing Stone Games.
        </p>
      </footer>
    </div>
  );
}
