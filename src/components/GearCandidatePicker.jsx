import React from 'react';
import styles from './GearCandidatePicker.module.css';

const MAX_CANDIDATES_PER_GROUP = 5;

function getItemKey(item = {}) {
  return item.itemKey || item.link || item.name || '';
}

function makeControlId(groupId, itemKey, index) {
  const safeGroupId = String(groupId || 'slot')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  const safeItemKey = String(itemKey || 'planner')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 48);

  return `gear-candidate-${safeGroupId}-${safeItemKey}-${index}`;
}

function ItemDetails({ item }) {
  const effects = Array.isArray(item.effects) ? item.effects : [];
  const visibleEffects = effects.slice(0, 3);
  const remainingEffectCount = Math.max(0, effects.length - visibleEffects.length);
  const score = item.stackAwareScore;

  return (
    <div className={styles.itemDetails}>
      <div className={styles.itemMeta}>
        {item.minLevel != null && (
          <span>
            ML
            {item.minLevel}
          </span>
        )}
        {score != null && (
          <span>
            Score
            {' '}
            {Math.round(score)}
          </span>
        )}
        {Array.isArray(item.augmentSlots) && item.augmentSlots.length > 0 && (
          <span>
            {item.augmentSlots.length}
            {' '}
            augment slot
            {item.augmentSlots.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {visibleEffects.length > 0 && (
        <ul className={styles.effectList}>
          {visibleEffects.map((effect, index) => (
            <li key={`${effect}-${index}`}>{effect}</li>
          ))}
          {remainingEffectCount > 0 && (
            <li className={styles.moreEffects}>
              +
              {remainingEffectCount}
              {' '}
              more
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default function GearCandidatePicker({
  groups = [],
  lockedItems = {},
  onChange,
  onReplan,
  isLoading = false,
}) {
  const visibleGroups = Array.isArray(groups) ? groups : [];
  const lockedCount = Object.values(lockedItems || {}).filter(Boolean).length;

  if (visibleGroups.length === 0) {
    return null;
  }

  function handleSelection(groupId, itemKey) {
    if (!isLoading && typeof onChange === 'function') {
      onChange(groupId, itemKey);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="gear-candidate-heading">
      <div className={styles.header}>
        <div>
          <h2 id="gear-candidate-heading" className={styles.heading}>
            Choose Gear Candidates
          </h2>
          <p className={styles.description}>
            Keep the planner recommendation or lock a specific item in any slot,
            then run the planner again around those choices.
          </p>
        </div>
        <span className={styles.lockCount} aria-live="polite">
          {lockedCount}
          {' '}
          locked
        </span>
      </div>

      <div className={styles.groupGrid}>
        {visibleGroups.map((group, groupIndex) => {
          const groupId = group.groupId || group.slot || `slot-${groupIndex}`;
          const lockedItemKey = lockedItems?.[groupId] || null;
          const candidates = (Array.isArray(group.candidates) ? group.candidates : [])
            .slice(0, MAX_CANDIDATES_PER_GROUP);
          const recommendedItem = candidates.find(
            (item) => getItemKey(item) === group.selectedItemKey,
          );
          const plannerControlId = makeControlId(groupId, 'planner', groupIndex);
          const radioName = `gear-candidate-${groupId}`;

          return (
            <fieldset
              key={groupId}
              className={styles.group}
              disabled={isLoading}
            >
              <legend className={styles.legend}>{group.label || groupId}</legend>

              <div className={styles.optionList}>
                <label
                  className={`${styles.option} ${!lockedItemKey ? styles.selected : ''}`}
                  htmlFor={plannerControlId}
                >
                  <input
                    id={plannerControlId}
                    className={styles.radio}
                    type="radio"
                    name={radioName}
                    value=""
                    checked={!lockedItemKey}
                    onChange={() => handleSelection(groupId, null)}
                  />
                  <span className={styles.optionContent}>
                    <span className={styles.optionTopLine}>
                      <span className={styles.itemName}>Planner choice</span>
                      <span className={styles.automaticBadge}>Automatic</span>
                    </span>
                    <span className={styles.plannerHint}>
                      {recommendedItem
                        ? `Currently recommends ${recommendedItem.name}`
                        : 'Let the planner choose the best fit for this slot.'}
                    </span>
                  </span>
                </label>

                {candidates.map((item, candidateIndex) => {
                  const itemKey = getItemKey(item);
                  const isRecommended = itemKey === group.selectedItemKey;
                  const isLocked = itemKey === lockedItemKey;
                  const controlId = makeControlId(
                    groupId,
                    itemKey,
                    `${groupIndex}-${candidateIndex}`,
                  );

                  return (
                    <label
                      key={itemKey || candidateIndex}
                      className={`${styles.option} ${isLocked ? styles.selected : ''}`}
                      htmlFor={controlId}
                    >
                      <input
                        id={controlId}
                        className={styles.radio}
                        type="radio"
                        name={radioName}
                        value={itemKey}
                        checked={isLocked}
                        onChange={() => handleSelection(groupId, itemKey)}
                      />
                      <span className={styles.optionContent}>
                        <span className={styles.optionTopLine}>
                          <span className={styles.itemName}>{item.name}</span>
                          <span className={styles.badges}>
                            {isRecommended && (
                              <span className={styles.recommendedBadge}>
                                Recommended
                              </span>
                            )}
                            {isLocked && (
                              <span className={styles.lockedBadge}>Locked</span>
                            )}
                          </span>
                        </span>
                        <ItemDetails item={item} />
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.replanButton}
          onClick={onReplan}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className={styles.spinner} aria-hidden="true" />
              Replanning...
            </>
          ) : (
            'Run planner with these choices'
          )}
        </button>
        <p className={styles.footerHint}>
          Automatic slots can change when the planner recalculates the complete set.
        </p>
      </div>
    </section>
  );
}
