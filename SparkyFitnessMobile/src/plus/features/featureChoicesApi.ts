import type {
  FeatureChoices,
  FeatureChoicesResponse,
  UpdateFeatureChoicesBody,
} from '@workspace/shared';
import { apiFetch } from '../../services/api/apiClient';

/**
 * Optional feature choices (sparkyfitness-plus #2), read and written through
 * the server's `GET`/`PATCH /api/user-preferences/features`. Only explicit
 * choices are stored; a missing key means the registry default.
 */
export const fetchFeatureChoices = async (): Promise<FeatureChoices> => {
  const response = await apiFetch<FeatureChoicesResponse>({
    endpoint: '/api/user-preferences/features',
    serviceName: 'Feature Choices API',
    operation: 'fetch feature choices',
  });
  return response?.feature_choices ?? {};
};

export const patchFeatureChoices = async (
  patch: UpdateFeatureChoicesBody
): Promise<FeatureChoices> => {
  const response = await apiFetch<FeatureChoicesResponse>({
    endpoint: '/api/user-preferences/features',
    serviceName: 'Feature Choices API',
    operation: 'update feature choices',
    method: 'PATCH',
    body: patch,
  });
  return response?.feature_choices ?? {};
};
