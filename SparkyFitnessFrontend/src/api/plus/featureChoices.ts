import type {
  FeatureChoices,
  FeatureChoicesResponse,
  UpdateFeatureChoicesBody,
} from '@workspace/shared';
import { apiCall } from '@/api/api';

/**
 * Optional feature choices (sparkyfitness-plus #2), read and written through
 * the server's `GET`/`PATCH /api/user-preferences/features`. Only explicit
 * choices are stored; a missing key means the registry default.
 */
export const getFeatureChoices = async (): Promise<FeatureChoices> => {
  const response = await apiCall<FeatureChoicesResponse>(
    '/user-preferences/features',
    { method: 'GET', suppress404Toast: true }
  );
  return response?.feature_choices ?? {};
};

export const patchFeatureChoices = async (
  patch: UpdateFeatureChoicesBody
): Promise<FeatureChoices> => {
  const response = await apiCall<FeatureChoicesResponse>(
    '/user-preferences/features',
    { method: 'PATCH', body: patch }
  );
  return response?.feature_choices ?? {};
};
