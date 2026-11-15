import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  FEATURE_KEYS,
  featureStorage,
  isFeatureEnabled,
  type FeatureChoices,
  type FeatureKey,
  type OPTIONAL_FEATURES,
} from '@workspace/shared';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import {
  getFeatureChoices,
  patchFeatureChoices,
} from '@/api/plus/featureChoices';

/**
 * The website's optional-feature switches (sparkyfitness-plus #2), built on
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

const PLATFORM = 'web';
export const plusFeatureChoicesKey = ['plus', 'featureChoices'] as const;
const SAVE_MUTATION_KEY = ['plus', 'featureChoices', 'save'] as const;

const findChoicesQuery = (queryClient: QueryClient) =>
  queryClient
    .getQueryCache()
    .find({ queryKey: plusFeatureChoicesKey, exact: true });

/**
 * Whether the switches can be used: only once the choices have loaded, and
 * never while acting for someone else (the server lets only the owner change
 * them).
 */
export type FeatureChoicesEditState =
  'ready' | 'loading' | 'loadFailed' | 'actingOnBehalf';

/**
 * The signed-in person's choices. While they load, if they fail, or while
 * acting for someone else, every feature is at its default, so nothing
 * disappears by accident. The cache is the session's source of truth.
 */
export function useFeatureChoices() {
  const { isActingOnBehalf } = useActiveUser();
  const query = useQuery({
    queryKey: plusFeatureChoicesKey,
    queryFn: getFeatureChoices,
    enabled: !isActingOnBehalf,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const choices: FeatureChoices | null =
    isActingOnBehalf || !query.data ? null : query.data;
  const editState: FeatureChoicesEditState = isActingOnBehalf
    ? 'actingOnBehalf'
    : query.isSuccess
      ? 'ready'
      : query.isError
        ? 'loadFailed'
        : 'loading';
  const { refetch } = query;
  const reload = useCallback(() => {
    void refetch();
  }, [refetch]);
  return { choices, editState, reload };
}

/** Whether a feature shows on the website. */
export function usePlusFeatureEnabled(key: ChoiceFeatureKey): boolean {
  const { choices } = useFeatureChoices();
  return isFeatureEnabled(key, PLATFORM, { choices, cycleEnabled: null });
}

/**
 * Turns a feature on or off on the website. The cache changes at once; saves
 * run one at a time and only send the key that changed.
 */
export function useSetPlusFeature() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { mutate, isPending } = useMutation({
    mutationKey: SAVE_MUTATION_KEY,
    scope: { id: 'plus-feature-choices' },
    mutationFn: ({
      key,
      enabled,
    }: {
      key: ChoiceFeatureKey;
      enabled: boolean;
    }) => patchFeatureChoices({ [PLATFORM]: { [key]: enabled } }),
    // useAuth clears the cache when the account changes; an answer for an
    // account no longer on screen must not be written.
    onMutate: () => findChoicesQuery(queryClient),
    onSuccess: (saved, _vars, startedFrom) => {
      if (findChoicesQuery(queryClient) !== startedFrom) return;
      if (queryClient.isMutating({ mutationKey: SAVE_MUTATION_KEY }) <= 1) {
        queryClient.setQueryData(plusFeatureChoicesKey, saved);
      }
    },
    onError: () => {
      if (queryClient.isMutating({ mutationKey: SAVE_MUTATION_KEY }) <= 1) {
        void queryClient.invalidateQueries({ queryKey: plusFeatureChoicesKey });
      }
    },
    meta: {
      errorMessage: t(
        'plus.features.saveError',
        'Could not save your feature choice. Please try again.'
      ),
    },
  });

  const setFeature = useCallback(
    (key: ChoiceFeatureKey, enabled: boolean) => {
      const current = queryClient.getQueryData<FeatureChoices>(
        plusFeatureChoicesKey
      );
      // Not loaded: a guess could bring back a feature the person turned off.
      if (!current) return;
      void queryClient.cancelQueries({ queryKey: plusFeatureChoicesKey });
      queryClient.setQueryData<FeatureChoices>(plusFeatureChoicesKey, {
        ...current,
        [PLATFORM]: { ...current[PLATFORM], [key]: enabled },
      });
      mutate({ key, enabled });
    },
    [queryClient, mutate]
  );

  return { setFeature, isPending };
}
