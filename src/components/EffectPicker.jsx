import React, {
  useId,
  useMemo,
  useState,
} from 'react';
import styles from './EffectPicker.module.css';

const MAX_VISIBLE_RESULTS = 50;

function cleanText(value) {
  return String(value || '').trim();
}

function getPrefixIds(effect) {
  return (effect.prefixes || [])
    .map((prefix) => prefix.id)
    .filter(Boolean);
}

function getItemCountLabel(count) {
  const itemCount = Number(count);

  if (!Number.isFinite(itemCount) || itemCount < 1) {
    return null;
  }

  return `${itemCount} item${itemCount === 1 ? '' : 's'}`;
}

export default function EffectPicker({
  effects = [],
  selectedEffects = [],
  onChange,
  isLoading = false,
  error = null,
}) {
  const componentId = useId();
  const [query, setQuery] = useState('');
  const [announcement, setAnnouncement] = useState('');

  const effectById = useMemo(
    () => new Map(effects.map((effect) => [effect.id, effect])),
    [effects],
  );

  const selectedIds = useMemo(
    () => new Set(selectedEffects.map((selection) => selection.effectId)),
    [selectedEffects],
  );

  const matchingEffects = useMemo(() => {
    const normalizedQuery = cleanText(query).toLowerCase();

    return effects.filter((effect) => {
      if (selectedIds.has(effect.id)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const searchableText = [
        effect.name,
        ...(effect.prefixes || []).flatMap((prefix) => [
          prefix.id,
          prefix.label,
        ]),
      ].join(' ').toLowerCase();

      return searchableText.includes(normalizedQuery);
    });
  }, [effects, query, selectedIds]);

  const visibleEffects = matchingEffects.slice(0, MAX_VISIBLE_RESULTS);
  const selectedEntries = selectedEffects
    .map((selection) => ({
      effect: effectById.get(selection.effectId),
      selection,
    }))
    .filter((entry) => entry.effect);

  function emitChange(nextSelections) {
    if (typeof onChange === 'function') {
      onChange(nextSelections);
    }
  }

  function handleAddEffect(effect) {
    const prefixes = getPrefixIds(effect);

    if (selectedIds.has(effect.id) || prefixes.length === 0) {
      return;
    }

    emitChange([
      ...selectedEffects,
      {
        effectId: effect.id,
        prefixes,
      },
    ]);
    setAnnouncement(`${effect.name} added. All available prefixes are selected.`);
  }

  function handleRemoveEffect(effect) {
    emitChange(
      selectedEffects.filter(
        (selection) => selection.effectId !== effect.id,
      ),
    );
    setAnnouncement(`${effect.name} removed.`);
  }

  function handlePrefixToggle(effect, selection, prefixId) {
    const selectedPrefixIds = new Set(selection.prefixes || []);

    if (selectedPrefixIds.has(prefixId)) {
      if (selectedPrefixIds.size === 1) {
        setAnnouncement(
          `${effect.name} must keep at least one prefix selected.`,
        );
        return;
      }

      selectedPrefixIds.delete(prefixId);
    } else {
      selectedPrefixIds.add(prefixId);
    }

    const orderedPrefixes = getPrefixIds(effect)
      .filter((id) => selectedPrefixIds.has(id));

    emitChange(
      selectedEffects.map((entry) => (
        entry.effectId === effect.id
          ? { ...entry, prefixes: orderedPrefixes }
          : entry
      )),
    );

    const prefix = (effect.prefixes || [])
      .find((entry) => entry.id === prefixId);
    const prefixLabel = prefix?.label || prefixId;
    const isNowSelected = selectedPrefixIds.has(prefixId);

    setAnnouncement(
      `${prefixLabel} ${effect.name} ${isNowSelected ? 'selected' : 'cleared'}.`,
    );
  }

  const resultSummary = matchingEffects.length > MAX_VISIBLE_RESULTS
    ? `Showing the first ${MAX_VISIBLE_RESULTS} of ${matchingEffects.length} matching effects. Refine your search to see more.`
    : `${matchingEffects.length} available effect${matchingEffects.length === 1 ? '' : 's'}.`;

  return (
    <section
      className={styles.picker}
      aria-labelledby={`${componentId}-heading`}
      aria-busy={isLoading}
    >
      <div className={styles.headingRow}>
        <div>
          <h3 id={`${componentId}-heading`} className={styles.heading}>
            Desired effects
          </h3>
          <p className={styles.description}>
            Add effects you want the planner to prioritize, then choose their
            exact prefixes.
          </p>
        </div>
        {selectedEntries.length > 0 && (
          <span className={styles.selectedCount}>
            {selectedEntries.length}
            {' '}
            selected
          </span>
        )}
      </div>

      <div className={styles.searchArea}>
        <label htmlFor={`${componentId}-search`} className={styles.label}>
          Search effects
        </label>
        <input
          id={`${componentId}-search`}
          type="search"
          className={styles.searchInput}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="e.g. Wisdom, Doublestrike, Fortification"
          disabled={isLoading}
          aria-describedby={`${componentId}-search-hint ${componentId}-result-summary`}
        />
        <p id={`${componentId}-search-hint`} className={styles.hint}>
          Select an effect to add every available prefix, then turn off any
          prefixes you do not want.
        </p>

        {error && (
          <p className={styles.error} role="alert">
            {error.message || String(error)}
          </p>
        )}

        {isLoading && effects.length === 0 ? (
          <p className={styles.emptyState} role="status">
            Loading effects…
          </p>
        ) : (
          <>
            <p
              id={`${componentId}-result-summary`}
              className={styles.resultSummary}
              aria-live="polite"
            >
              {resultSummary}
            </p>

            {visibleEffects.length > 0 ? (
              <ul className={styles.resultList} aria-label="Effect search results">
                {visibleEffects.map((effect) => {
                  const itemCountLabel = getItemCountLabel(effect.itemCount);
                  const hasPrefixes = getPrefixIds(effect).length > 0;

                  return (
                    <li key={effect.id}>
                      <button
                        type="button"
                        className={styles.resultButton}
                        onClick={() => handleAddEffect(effect)}
                        disabled={isLoading || !hasPrefixes}
                      >
                        <span className={styles.resultName}>{effect.name}</span>
                        <span className={styles.resultMeta}>
                          {itemCountLabel && <span>{itemCountLabel}</span>}
                          <span>
                            {(effect.prefixes || []).length}
                            {' '}
                            prefix
                            {(effect.prefixes || []).length === 1 ? '' : 'es'}
                          </span>
                        </span>
                        <span className={styles.addLabel} aria-hidden="true">
                          Add
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.emptyState}>
                {effects.length === 0
                  ? 'No effects are available.'
                  : 'No unselected effects match your search.'}
              </p>
            )}
          </>
        )}
      </div>

      {selectedEntries.length > 0 && (
        <div className={styles.selectedArea}>
          <h4 className={styles.selectedHeading}>Selected effects and prefixes</h4>
          <div className={styles.selectedList}>
            {selectedEntries.map(({ effect, selection }, effectIndex) => {
              const selectedPrefixIds = selection.prefixes || [];

              return (
                <article key={effect.id} className={styles.selectedCard}>
                  <div className={styles.selectedCardHeader}>
                    <h5 className={styles.effectName}>{effect.name}</h5>
                    <button
                      type="button"
                      className={styles.removeButton}
                      onClick={() => handleRemoveEffect(effect)}
                      disabled={isLoading}
                      aria-label={`Remove ${effect.name}`}
                    >
                      Remove
                    </button>
                  </div>

                  <fieldset className={styles.prefixFieldset}>
                    <legend className={styles.prefixLegend}>
                      Prefixes for
                      {' '}
                      {effect.name}
                    </legend>
                    <div className={styles.prefixList}>
                      {(effect.prefixes || []).map((prefix, prefixIndex) => {
                        const inputId = `${componentId}-effect-${effectIndex}-prefix-${prefixIndex}`;
                        const isChecked = selectedPrefixIds.includes(prefix.id);
                        const isOnlySelection = isChecked
                          && selectedPrefixIds.length === 1;
                        const prefixItemCount = getItemCountLabel(prefix.itemCount);

                        return (
                          <label
                            key={prefix.id}
                            htmlFor={inputId}
                            className={`${styles.prefixOption} ${isChecked ? styles.prefixSelected : ''}`}
                          >
                            <input
                              id={inputId}
                              type="checkbox"
                              className={styles.checkbox}
                              checked={isChecked}
                              onChange={() => handlePrefixToggle(
                                effect,
                                selection,
                                prefix.id,
                              )}
                              disabled={isLoading || isOnlySelection}
                            />
                            <span className={styles.prefixText}>
                              <span className={styles.prefixLabel}>
                                {prefix.label || prefix.id}
                              </span>
                              {prefixItemCount && (
                                <span className={styles.prefixMeta}>
                                  {prefixItemCount}
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                  <p className={styles.selectionHint}>
                    At least one prefix must remain selected.
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      )}

      <p className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  );
}
