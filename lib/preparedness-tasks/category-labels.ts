const CATEGORY_LABELS: Record<string, string> = {
  general_evacuation_information: 'General Evacuation Information',
  general_shelter_in_place_information: 'General Shelter in Place Information',
  active_shooter: 'Active Shooter',
  emergency_planning_for_house_pets: 'Emergency Planning for House Pets',
  emergency_planning_for_large_animal_pets: 'Emergency Planning for Large Animal Pets',
  personal_identity_theft: 'Personal Identity Theft',
};

const CATEGORY_ORDER = [
  'general_evacuation_information',
  'general_shelter_in_place_information',
  'active_shooter',
  'emergency_planning_for_house_pets',
  'emergency_planning_for_large_animal_pets',
  'personal_identity_theft',
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
