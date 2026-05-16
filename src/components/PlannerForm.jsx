import React, { useState } from 'react';
import styles from './PlannerForm.module.css';

const EXAMPLES = [
  'Level 34 Wisdom-based Monk using handwraps and cloth armor, focused on Tactical DC, Stunning, PRR, MRR, and Dodge',
  'Level 34 Strength melee fighter using great axe and heavy armor, focused on Melee Power, Doublestrike, and PRR',
  'Level 34 Dexterity-based rogue using daggers, focused on Doublestrike, Deadly, and Sneak Attack',
  'Level 32 tank build with heavy armor, focused on PRR, MRR, Fortification, Intimidate, and Dodge',
];

export default function PlannerForm({ onSubmit, isLoading }) {
  const [goal, setGoal] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = goal.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed);
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
        Describe your build in plain English. Include your level, primary stat,
        class or playstyle, weapon type, and any stats you want to prioritize.
      </p>

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        <label htmlFor="goal-input" className={styles.label}>
          Build goal
        </label>
        <textarea
          id="goal-input"
          className={styles.textarea}
          value={goal}
          onChange={e => setGoal(e.target.value)}
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

        <button
          type="submit"
          className={styles.submitBtn}
          disabled={!goal.trim() || isLoading}
          aria-busy={isLoading}
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
      </form>

      <div className={styles.examples}>
        <p className={styles.examplesLabel}>Try an example:</p>
        <ul className={styles.exampleList} role="list">
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
    </section>
  );
}
