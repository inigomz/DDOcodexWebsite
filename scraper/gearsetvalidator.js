// gearsetValidator.js

function getGearTier(item) {
  const name = String(item.name || '').toLowerCase();
  const minLevel = Number(item.minLevel);

  // Name override helps with items like "Legendary ___"
  if (name.includes('legendary')) {
    return 'legendary';
  }

  if (name.includes('epic')) {
    return 'epic';
  }

  if (!Number.isNaN(minLevel)) {
    if (minLevel >= 28) return 'legendary';
    if (minLevel >= 20) return 'epic';
  }

  return 'heroic';
}

function normalizeSetId(setName) {
  return String(setName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getItemKey(item) {
  return item.itemKey || item.link || item.name;
}

function getPiecesRequired(bonus, membership) {
  if (bonus.piecesRequired !== null && bonus.piecesRequired !== undefined) {
    return bonus.piecesRequired;
  }

  // Many older DDO sets are 2-piece sets but do not always say
  // "2 Pieces Equipped" in a clean machine-readable way.
  // Mark this as inferred in the active result.
  return Math.min(2, membership.availablePieces || 2);
}

function isPiecesRequiredInferred(bonus) {
  return bonus.piecesRequired === null || bonus.piecesRequired === undefined;
}

function buildSetGroups(equippedItems) {
  const setGroups = new Map();

  for (const item of equippedItems) {
    const tier = getGearTier(item);
    const itemKey = getItemKey(item);

    for (const membership of item.setMembership || []) {
      const setId =
        membership.setId || normalizeSetId(membership.setName);

      if (!setId) {
        continue;
      }

      if (!setGroups.has(setId)) {
        setGroups.set(setId, {
          setId,
          setName: membership.setName,
          sourceSection: membership.sourceSection || null,
          membership,
          piecesByTier: {
            heroic: [],
            epic: [],
            legendary: []
          }
        });
      }

      const group = setGroups.get(setId);

      const alreadyCounted = group.piecesByTier[tier].some(
        piece => piece.itemKey === itemKey
      );

      if (!alreadyCounted) {
        group.piecesByTier[tier].push({
          itemKey,
          name: item.name,
          slot: item.slot,
          minLevel: item.minLevel,
          tier
        });
      }
    }
  }

  return setGroups;
}

function getTieredEffectForTier(bonus, tier) {
  if (!Array.isArray(bonus.tieredEffects)) {
    return null;
  }

  const tieredEffect = bonus.tieredEffects.find(
    effect => effect.tier === tier
  );

  if (!tieredEffect) {
    return null;
  }

  return {
    tier,
    symbol: tieredEffect.symbol || null,
    valueText: tieredEffect.valueText || '',
    effectText: tieredEffect.effect || '',
    fullEffect: `${tieredEffect.valueText || ''} ${tieredEffect.effect || ''}`.trim()
  };
}

function getActiveSetBonuses(equippedItems) {
  const setGroups = buildSetGroups(equippedItems);
  const activeSetBonuses = [];

  for (const group of setGroups.values()) {
    const membership = group.membership;
    const bonuses = membership.bonuses || [];

    for (const tier of ['heroic', 'epic', 'legendary']) {
      const equippedPieces = group.piecesByTier[tier];
      const piecesEquipped = equippedPieces.length;

      if (piecesEquipped === 0) {
        continue;
      }

      for (const bonus of bonuses) {
        const piecesRequired = getPiecesRequired(bonus, membership);

        if (piecesEquipped < piecesRequired) {
          continue;
        }

        const tieredEffect = getTieredEffectForTier(bonus, tier);

        // If the bonus has tiered effects, only apply the matching tier.
        if (
          Array.isArray(bonus.tieredEffects) &&
          bonus.tieredEffects.length > 0
        ) {
          if (!tieredEffect) {
            continue;
          }

          activeSetBonuses.push({
            setId: group.setId,
            setName: group.setName,
            tier,
            piecesEquipped,
            piecesRequired,
            piecesRequiredInferred: isPiecesRequiredInferred(bonus),
            equippedPieces,
            effect: tieredEffect.fullEffect,
            effectText: tieredEffect.effectText,
            valueText: tieredEffect.valueText,
            symbol: tieredEffect.symbol,
            sourceSection: group.sourceSection
          });

          continue;
        }

        // Non-tiered set bonus.
        activeSetBonuses.push({
          setId: group.setId,
          setName: group.setName,
          tier,
          piecesEquipped,
          piecesRequired,
          piecesRequiredInferred: isPiecesRequiredInferred(bonus),
          equippedPieces,
          effect: bonus.effect || bonus.effectRaw || '',
          effectText: bonus.effect || bonus.effectRaw || '',
          valueText: null,
          symbol: null,
          sourceSection: group.sourceSection
        });
      }
    }
  }

  return activeSetBonuses;
}

function getSetProgress(equippedItems) {
  const setGroups = buildSetGroups(equippedItems);
  const progress = [];

  for (const group of setGroups.values()) {
    for (const tier of ['heroic', 'epic', 'legendary']) {
      const equippedPieces = group.piecesByTier[tier];

      if (equippedPieces.length === 0) {
        continue;
      }

      progress.push({
        setId: group.setId,
        setName: group.setName,
        tier,
        piecesEquipped: equippedPieces.length,
        equippedPieces,
        sourceSection: group.sourceSection
      });
    }
  }

  return progress;
}

function validateGearset(equippedItems) {
  const activeSetBonuses = getActiveSetBonuses(equippedItems);
  const setProgress = getSetProgress(equippedItems);

  return {
    equippedItems,
    setProgress,
    activeSetBonuses
  };
}

module.exports = {
  getGearTier,
  getActiveSetBonuses,
  getSetProgress,
  validateGearset
};