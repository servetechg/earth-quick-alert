import { normalizeMediaList } from '@/lib/services/disaster-survey-media-service';
import type { DisasterSurveyMediaRef } from '@/lib/types/disaster-survey';

export const CITIZEN_ACTIVITY_MAX_PICTURES = 5;
export const CITIZEN_ACTIVITY_MAX_VIDEOS = 5;
export const CITIZEN_ACTIVITY_MEDIA_FOLDER = 'earthquick/citizen-activity';

export type CitizenActivityMediaRef = DisasterSurveyMediaRef;

export { normalizeMediaList };
