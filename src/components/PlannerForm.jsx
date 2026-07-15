import React, { useState } from 'react';
import EffectPicker from './EffectPicker';
import styles from './PlannerForm.module.css';

const EXAMPLES = [
  'Level 34 Wisdom-based Monk using handwraps and cloth armor, focused on Tactical DC, Stunning, PRR, MRR, and Dodge',
  'Level 34 Strength melee fighter using great axe and heavy armor, focused on Melee Power, Doublestrike, and PRR',
  'Level 34 Dexterity-based rogue using daggers, focused on Doublestrike, Deadly, and Sneak Attack',
  'Level 32 tank build with heavy armor, focused on PRR, MRR, Fortification, Intimidate, and Dodge',
];

export default function PlannerForm({
  onSubmit,
  isLoading,
  effects,
  catalogState,
  catalogError,
}) {
  const [goal, setGoal] = useState('');
  const [selectedEffects, setSelectedEffects] = useState([]);
  const [useNaturalLanguage, setUseNaturalLanguage] = useState(true);

  const trimmedGoal = goal.trim();
  const hasSelectedEffects = selectedEffects.length > 0;
  const hasRequiredInput = useNaturalLanguage
    ? Boolean(trimmedGoal)
    : hasSelectedEffects;

  function handleSubmit(e) {
    e.preventDefault();

    if (!hasRequiredInput || isLoading) return;

    onSubmit({
      goal: useNaturalLanguage ? trimmedGoal : '',
      effectSelections: selectedEffects,
      useNaturalLanguage,
    });
  }

  function handleExample(text) {
    setGoal(text);
  }

  return (
    <section className={styles.section} aria-labelledby="planner-heading">
      <h2 id="planner-heading" className={styles.heading}>
        Plan Your Gear
      </h2>
      <p className={styles.description}>
        Describe your build in plain English, choose specific effects, or use
        both methods together.
      </p>

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <label className={styles.modeToggle} htmlFor="use-build-description">
          <input
            id="use-build-description"
            type="checkbox"
            className={styles.modeCheckbox}
            checked={useNaturalLanguage}
            onChange={(event) => setUseNaturalLanguage(event.target.checked)}
            disabled={isLoading}
            aria-describedby="build-description-mode-hint"
          />
          <span className={styles.modeText}>
            <span className={styles.modeLabel}>Use build description</span>
            <span id="build-description-mode-hint" className={styles.modeHint}>
              Let the planner infer your level, build type, equipment, and
              priorities from a written description.
            </span>
          </span>
        </label>

        {useNaturalLanguage && (
          <div className={styles.descriptionFields}>
            <label htmlFor="goal-input" className={styles.label}>
              Build goal
            </label>
            <textarea
              id="goal-input"
              className={styles.textarea}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Level 34 Wisdom-based Monk using handwraps and cloth armor, focused on Tactical DC and Stunning…"
              rows={3}
              disabled={isLoading}
              aria-required="true"
              aria-describedby="goal-hint"
            />
            <p id="goal-hint" className={styles.hint}>
              The planner reads level, build type, primary stat, weapon subtype, armor
              preference, and priority terms from your description.
            </p>
          </div>
        )}

        <EffectPicker
          effects={effects}
          selectedEffects={selectedEffects}
          onChange={setSelectedEffects}
          isLoading={isLoading || catalogState === 'loading'}
          error={catalogError}
        />

        <button
          type="submit"
          className={styles.submitBtn}
          disabled={!hasRequiredInput || isLoading}
          aria-busy={isLoading}
          aria-describedby="plan-input-requirement"
        >
          {isLoading ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              Planning…
            </>
          ) : (
            'Plan Gear'
          )}
        </button>
        <p id="plan-input-requirement" className={styles.hint}>
          {useNaturalLanguage
            ? 'Enter a build description to run the planner.'
            : 'Select at least one desired effect to run without a build description.'}
        </p>
      </form>

      {useNaturalLanguage && (
        <div className={styles.examples}>
          <p className={styles.examplesLabel}>Try an example:</p>
          <ul className={styles.exampleList}>
            {EXAMPLES.map((ex, i) => (
              <li key={i}>
                <button
                  type="button"
                  className={styles.exampleBtn}
                  onClick={() => handleExample(ex)}
                  disabled={isLoading}
                >
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
