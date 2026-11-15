import { useCallback } from 'react';
import { isCardioModality, resolveExerciseModality } from '@workspace/shared';
import { usePlusFeatureEnabled } from './useFeatureChoices';

/**
 * The strength training switch (sparkyfitness-plus #2). Off, the app hides
 * live and logged strength workouts, workout presets and plans, plates & bars
 * and the strength statistics; activities, cardio sessions, routes and their
 * statistics stay. The cut is the shared exercise modality:
 * `duration_distance` is cardio, every other modality is strength.
 *
 * Jest mocks this module to "on" in `jest.setup.js`, so screens tested
 * without a QueryClientProvider keep working; tests of the switch re-mock it.
 */
export function useStrengthTrainingEnabled(): boolean {
  return usePlusFeatureEnabled('strengthTraining');
}

interface ExerciseModalityFields {
  modality?: string | null;
  category?: string | null;
  equipment?: readonly (string | null | undefined)[] | string | null;
}

/** Whether an exercise is cardio by its modality (explicit or derived). */
export function isCardioExercise(exercise: ExerciseModalityFields): boolean {
  return isCardioModality(
    resolveExerciseModality(
      exercise.modality,
      exercise.category,
      exercise.equipment
    )
  );
}

/**
 * A list filter for exercise lists and pickers: everything while strength
 * training is on, only cardio exercises while it is off.
 */
export function useStrengthExerciseFilter(): <T extends ExerciseModalityFields>(
  items: T[]
) => T[] {
  const strengthOn = useStrengthTrainingEnabled();
  return useCallback(
    <T extends ExerciseModalityFields>(items: T[]) =>
      strengthOn ? items : items.filter(isCardioExercise),
    [strengthOn]
  );
}
