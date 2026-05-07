const CATEGORY_LABELS: Record<string, string> = {
  individual_evacuation: 'Individual Evacuation',
  community_evacuation: 'Community Evacuation',
  shelter_in_place: 'General Shelter-in-Place',
  active_shooter: 'Active Shooter Preparedness',
  pets_household: 'Planning for Household Pets',
  pets_large: 'Planning for Large Animals',
  identity_theft: 'Identity Theft Protection',
  choking_first_aid: 'Choking First Aid',
};

const CATEGORY_ORDER = [
  'individual_evacuation',
  'community_evacuation',
  'shelter_in_place',
  'active_shooter',
  'pets_household',
  'pets_large',
  'identity_theft',
  'choking_first_aid',
];

export function getPreparednessCategoryLabel(category: string): string {
  if (CATEGORY_LABELS[category]) return CATEGORY_LABELS[category];
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function sortPreparednessCategories<T extends { category: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aIdx = CATEGORY_ORDER.indexOf(a.category);
    const bIdx = CATEGORY_ORDER.indexOf(b.category);
    if (aIdx === -1 && bIdx === -1) return a.category.localeCompare(b.category);
    if (aIdx === -1) return 1;
    if (bIdx === -1) return -1;
    return aIdx - bIdx;
  });
}
