import React, { useState } from 'react';
import styles from './GearResults.module.css';

function StatusPill({ count, label, tone }) {
  return (
    <div className={`${styles.statusPill} ${styles[tone] || ''}`}>
      <span className={styles.statusCount}>{count}</span>
      <span className={styles.statusLabel}>{label}</span>
    </div>
  );
}

function ItemCard({ item }) {
  const [expanded, setExpanded] = useState(false);
  const effects = item.effects || [];
  const hasEffects = effects.length > 0;

  return (
    <div className={styles.itemCard}>
      <button
        type="button"
        className={styles.itemHeader}
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
      >
        <div className={styles.itemHeaderLeft}>
          <span className={styles.slotBadge}>{item.slot || 'unknown'}</span>
          <span className={styles.itemName}>
            {item.link ? (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
              >
                {item.name}
              </a>
            ) : (
              item.name
            )}
          </span>
        </div>
        <div className={styles.itemHeaderRight}>
          {item.minLevel != null && (
            <span className={styles.levelBadge}>ML {item.minLevel}</span>
          )}
          {hasEffects && (
            <span className={styles.expandIcon} aria-hidden="true">
              {expanded ? '−' : '+'}
            </span>
          )}
        </div>
      </button>

      {expanded && hasEffects && (
        <div className={styles.itemBody}>
          <ul className={styles.effectList}>
            {effects.map((effect, i) => (
              <li key={i}>{effect}</li>
            ))}
          </ul>
          {item.augmentSlots && item.augmentSlots.length > 0 && (
            <div className={styles.metaRow}>
              <span className={styles.metaLabel}>Augment slots:</span>
              {item.augmentSlots.map((slot, i) => (
                <span key={i} className={styles.augmentChip}>
                  {typeof slot === 'string' ? slot : slot.color || slot.slotColor || 'slot'}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AugmentRow({ aug, kind }) {
  return (
    <li className={styles.augmentRow}>
      <span className={`${styles.kindBadge} ${styles[kind] || ''}`}>
        {kind === 'crafting' ? 'craft' : 'aug'}
      </span>
      <div className={styles.augmentMain}>
        <div className={styles.augmentTitle}>
          <strong>{aug.augmentName}</strong>
          {aug.itemName && (
            <span className={styles.augmentTarget}>
              → {aug.itemName}
            </span>
          )}
        </div>
        {aug.effect && (
          <div className={styles.augmentEffect}>{aug.effect}</div>
        )}
      </div>
    </li>
  );
}

function GapRow({ gap }) {
  const status = gap.status || 'unknown';
  return (
    <li className={`${styles.gapRow} ${styles[status] || ''}`}>
      <div className={styles.gapHeader}>
        <span className={styles.gapLabel}>{gap.label}</span>
        <span className={`${styles.gapStatus} ${styles[status] || ''}`}>
          {status.replace(/_/g, ' ')}
        </span>
      </div>
      <div className={styles.gapValues}>
        <span>current <strong>{gap.currentValue ?? 0}</strong></span>
        <span>min <strong>{gap.minimumValue ?? 0}</strong></span>
        <span>target <strong>{gap.targetValue ?? 0}</strong></span>
      </div>
    </li>
  );
}

function ConflictRow({ conflict }) {
  const winner = conflict.winningBonus?.raw || 'unknown winner';
  const suppressed = (conflict.suppressedBonuses || [])
    .map(b => b.raw)
    .filter(Boolean);

  return (
    <li className={styles.conflictRow}>
      <div className={styles.conflictHeader}>
        <span className={styles.stackKey}>{conflict.stackKey}</span>
      </div>
      <div className={styles.conflictBody}>
        <span className={styles.winner}>{winner}</span>
        <span className={styles.suppressLabel}>suppresses</span>
        <span className={styles.suppressed}>{suppressed.join(', ') || 'none'}</span>
      </div>
    </li>
  );
}

export default function GearResults({ summary, onGetAdvice, advisorState }) {
  const counts = summary.counts || {};
  const profile = summary.buildProfile || {};

  const validationErrors = counts.validationErrorCount || 0;
  const isValid = validationErrors === 0;

  return (
    <section className={styles.section} aria-label="Gear plan results">
      {/* ── Verdict ── */}
      <div className={styles.verdict}>
        <div className={styles.verdictHeader}>
          <span className={`${styles.verdictBadge} ${isValid ? styles.valid : styles.invalid}`}>
            {isValid ? '✓ Valid Build' : `✗ ${validationErrors} Error${validationErrors === 1 ? '' : 's'}`}
          </span>
          {summary.scoreBreakdown && (
            <span className={styles.score}>
              Score: <strong>{Math.round(summary.scoreBreakdown.score)}</strong>
            </span>
          )}
        </div>

        {profile.buildTypes && profile.buildTypes.length > 0 && (
          <div className={styles.profileTags}>
            <span className={styles.profileTagLabel}>Build:</span>
            {profile.buildTypes.map(t => (
              <span key={t} className={styles.profileTag}>{t}</span>
            ))}
            {profile.primaryStats && profile.primaryStats.map(s => (
              <span key={s} className={`${styles.profileTag} ${styles.primaryStat}`}>{s}</span>
            ))}
          </div>
        )}
      </div>

      {/* ── Status Pills ── */}
      <div className={styles.statusGrid}>
        <StatusPill count={counts.metTargetCount || 0} label="Targets met" tone="success" />
        <StatusPill count={counts.openGapCount || 0} label="Open gaps" tone={counts.openGapCount > 0 ? 'warning' : 'neutral'} />
        <StatusPill count={counts.normalAssignmentCount || 0} label="Augments" tone="info" />
        <StatusPill count={counts.craftingAssignmentCount || 0} label="Crafting" tone="info" />
        <StatusPill count={counts.relevantConflictCount || 0} label="Conflicts" tone={counts.relevantConflictCount > 0 ? 'warning' : 'neutral'} />
      </div>

      {/* ── Selected Gear ── */}
      <div className={styles.block}>
        <h3 className={styles.blockHeading}>
          Selected Gear
          <span className={styles.blockCount}>{(summary.selectedGear || []).length}</span>
        </h3>
        <div className={styles.itemList}>
          {(summary.selectedGear || []).map((item, i) => (
            <ItemCard key={item.itemKey || i} item={item} />
          ))}
        </div>
      </div>

      {/* ── Augments ── */}
      {(summary.normalAugments?.length > 0 || summary.craftingAugments?.length > 0) && (
        <div className={styles.block}>
          <h3 className={styles.blockHeading}>
            Augment Plan
            <span className={styles.blockCount}>
              {(summary.normalAugments?.length || 0) + (summary.craftingAugments?.length || 0)}
            </span>
          </h3>
          <ul className={styles.augmentList}>
            {(summary.normalAugments || []).map((aug, i) => (
              <AugmentRow key={`n-${i}`} aug={aug} kind="normal" />
            ))}
            {(summary.craftingAugments || []).map((aug, i) => (
              <AugmentRow key={`c-${i}`} aug={aug} kind="crafting" />
            ))}
          </ul>
        </div>
      )}

      {/* ── Remaining Gaps ── */}
      {summary.remainingGaps && summary.remainingGaps.length > 0 && (
        <div className={styles.block}>
          <h3 className={styles.blockHeading}>
            Remaining Gaps
            <span className={styles.blockCount}>{summary.remainingGaps.length}</span>
          </h3>
          <ul className={styles.gapList}>
            {summary.remainingGaps.slice(0, 10).map((gap, i) => (
              <GapRow key={gap.targetId || i} gap={gap} />
            ))}
          </ul>
        </div>
      )}

      {/* ── Stacking Conflicts ── */}
      {summary.remainingStackingConflicts && summary.remainingStackingConflicts.length > 0 && (
        <div className={styles.block}>
          <h3 className={styles.blockHeading}>
            Stacking Conflicts
            <span className={styles.blockCount}>
              {summary.remainingStackingConflicts.length}
            </span>
          </h3>
          <ul className={styles.conflictList}>
            {summary.remainingStackingConflicts.slice(0, 8).map((c, i) => (
              <ConflictRow key={c.stackKey || i} conflict={c} />
            ))}
          </ul>
        </div>
      )}

      {/* ── AI Advisor button ── */}
      <div className={styles.advisorPrompt}>
        <button
          type="button"
          className={styles.advisorBtn}
          onClick={onGetAdvice}
          disabled={advisorState === 'loading'}
        >
          {advisorState === 'loading' ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              Generating advice…
            </>
          ) : advisorState === 'done' ? (
            'Regenerate AI Advice'
          ) : (
            'Get AI Advice ↓'
          )}
        </button>
        <p className={styles.advisorHint}>
          Sends the planner result to the advisor for a written breakdown.
        </p>
      </div>
    </section>
  );
}
