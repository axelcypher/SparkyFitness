import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FEATURE_KEYS,
  featureStorage,
  isFeatureEnabled,
  type FeatureChoices,
  type FeatureKey,
  type OPTIONAL_FEATURES,
} from '@workspace/shared';
import { fetchFeatureChoices, patchFeatureChoices } from './featureChoicesApi';

/**
 * The mobile app's optional-feature switches (sparkyfitness-plus #2), built on
 * the shared registry. Upstream has no Features screen yet; this module is the
 * fork's stand-in, so a gate only asks `usePlusFeatureEnabled(key)`.
 */

/** Registry keys switched through `feature_choices` (cycle has its own). */
export type ChoiceFeatureKey = {
  [K in FeatureKey]: (typeof OPTIONAL_FEATURES)[K]['storage'] extends 'choices'
    ? K
    : never;
}[FeatureKey];

export const CHOICE_FEATURE_KEYS = FEATURE_KEYS.filter(
  (key): key is ChoiceFeatureKey => featureStorage(key) === 'choices'
);

const PLATFORM = 'mobile';
export const plusFeatureChoicesQueryKey = ['plus', 'featureChoices'] as const;

/**
 * The person's choices. While they load or if they fail, every feature is at
 * its default, so nothing disappears by accident.
 */
export function useFeatureChoices() {
  const query = useQuery({
    queryKey: plusFeatureChoicesQueryKey,
    queryFn: fetchFeatureChoices,
    staleTime: 1000 * 60 * 30,
  });
  return {
    choices: query.data ?? null,
    isLoaded: query.isSuccess,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

/** Whether a feature shows in the mobile app. */
export function usePlusFeatureEnabled(key: ChoiceFeatureKey): boolean {
  const { choices } = useFeatureChoices();
  return isFeatureEnabled(key, PLATFORM, { choices, cycleEnabled: null });
}

/** Whether a feature is on in these choices, for the Features screen. */
export function isPlusFeatureOn(
  key: ChoiceFeatureKey,
  choices: FeatureChoices | null
): boolean {
  return isFeatureEnabled(key, PLATFORM, { choices, cycleEnabled: null });
}

/**
 * Turns a feature on or off in the mobile app. The cache changes at once and
 * goes back when the save fails; only the key that changed is sent.
 */
export function useSetPlusFeature(onError?: () => void) {
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation({
    scope: { id: 'plus-feature-choices' },
    mutationFn: ({
      key,
      enabled,
    }: {
      key: ChoiceFeatureKey;
      enabled: boolean;
    }) => patchFeatureChoices({ [PLATFORM]: { [key]: enabled } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(plusFeatureChoicesQueryKey, saved);
    },
    onError: () => {
      void queryClient.invalidateQueries({
        queryKey: plusFeatureChoicesQueryKey,
      });
      onError?.();
    },
  });

  const setFeature = useCallback(
    (key: ChoiceFeatureKey, enabled: boolean) => {
      const current = queryClient.getQueryData<FeatureChoices>(
        plusFeatureChoicesQueryKey
      );
      // Not loaded: a guess could bring back a feature the person turned off.
      if (!current) return;
      void queryClient.cancelQueries({ queryKey: plusFeatureChoicesQueryKey });
      queryClient.setQueryData<FeatureChoices>(plusFeatureChoicesQueryKey, {
        ...current,
        [PLATFORM]: { ...current[PLATFORM], [key]: enabled },
      });
      mutate({ key, enabled });
    },
    [queryClient, mutate]
  );

  return { setFeature, isPending };
}
