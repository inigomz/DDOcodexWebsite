import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';
import PlannerForm from './components/PlannerForm';
import GearResults from './components/GearResults';
import AdvisorReport from './components/AdvisorReport';
import DDOChatbot from './components/DDOChatbot';
import styles from './App.module.css';

const PLAN_GEAR_URL = '/.netlify/functions/planGear';
const ADVISOR_URL = '/.netlify/functions/advisor';

export default function App() {
  const [planState, setPlanState] = useState('idle'); // idle | loading | done | error
  const [advisorState, setAdvisorState] = useState('idle'); // idle | loading | done | error
  const [catalogState, setCatalogState] = useState('loading');
  const [effectCatalog, setEffectCatalog] = useState([]);
  const [catalogError, setCatalogError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [candidateGroups, setCandidateGroups] = useState([]);
  const [lastPlanInput, setLastPlanInput] = useState(null);
  const [lockedItems, setLockedItems] = useState({});
  const [advice, setAdvice] = useState(null);
  const [planError, setPlanError] = useState(null);
  const [advisorError, setAdvisorError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadEffectCatalog() {
      setCatalogState('loading');
      setCatalogError(null);

      try {
        const res = await fetch(PLAN_GEAR_URL, {
          method: 'GET',
          signal: controller.signal,
        });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || `Server error ${res.status}`);
        }

        setEffectCatalog(data.effects || []);
        setCatalogState('done');
      } catch (err) {
        if (err.name === 'AbortError') return;

        setCatalogError(err.message);
        setCatalogState('error');
      }
    }

    loadEffectCatalog();

    return () => controller.abort();
  }, []);

  const requestPlan = useCallback(async (planInput, preserveResults = false) => {
    setPlanState('loading');

    if (!preserveResults) {
      setSummary(null);
      setCandidateGroups([]);
    }

    setAdvice(null);
    setPlanError(null);
    setAdvisorState('idle');
    setAdvisorError(null);

    try {
      const res = await fetch(PLAN_GEAR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planInput),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Server error ${res.status}`);
      }

      setSummary(data.summary);
      setCandidateGroups(data.candidateGroups || []);
      setPlanState('done');
    } catch (err) {
      setPlanError(err.message);
      setPlanState('error');
    }
  }, []);

  const handlePlan = useCallback((planInput) => {
    const nextPlanInput = {
      goal: planInput.goal,
      effectSelections: planInput.effectSelections || [],
      useNaturalLanguage: planInput.useNaturalLanguage !== false,
    };

    setLastPlanInput(nextPlanInput);
    setLockedItems({});
    requestPlan({
      ...nextPlanInput,
      lockedItems: {},
    });
  }, [requestPlan]);

  const handleLockedItemChange = useCallback((groupId, itemKey) => {
    setLockedItems((current) => {
      const next = { ...current };

      if (itemKey) {
        next[groupId] = itemKey;
      } else {
        delete next[groupId];
      }

      return next;
    });
  }, []);

  const handleReplan = useCallback(() => {
    if (!lastPlanInput || planState === 'loading') return;

    requestPlan({
      ...lastPlanInput,
      lockedItems,
    }, true);
  }, [lastPlanInput, lockedItems, planState, requestPlan]);

  const handleGetAdvice = useCallback(async () => {
    if (!summary) return;

    setAdvisorState('loading');
    setAdvice(null);
    setAdvisorError(null);

    try {
      const res = await fetch(ADVISOR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary }),
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
          effects={effectCatalog}
          catalogState={catalogState}
          catalogError={catalogError}
        />

        {planState === 'error' && (
          <div className={styles.errorBanner} role="alert">
            <strong>Planning failed:</strong>
            {' '}
            {planError}
          </div>
        )}

        {planState === 'loading' && (
          <div className={styles.loadingBanner} aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            {summary
              ? 'Re-running the planner around your locked gear…'
              : 'Running gear planner — searching items, scoring augments, validating build…'}
          </div>
        )}

        {summary && (
          <>
            <GearResults
              summary={summary}
              candidateGroups={candidateGroups}
              lockedItems={lockedItems}
              onLockedItemChange={handleLockedItemChange}
              onReplan={handleReplan}
              isReplanning={planState === 'loading'}
              onGetAdvice={handleGetAdvice}
              advisorState={advisorState}
            />

            {advisorState === 'error' && (
              <div className={styles.errorBanner} role="alert">
                <strong>Advisor failed:</strong>
                {' '}
                {advisorError}
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
          Data sourced from
          {' '}
          <a href="https://ddowiki.com" target="_blank" rel="noopener noreferrer">
            DDO Wiki
          </a>
          . Not affiliated with Standing Stone Games.
        </p>
      </footer>

      <DDOChatbot />
    </div>
  );
}
