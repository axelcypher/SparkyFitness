// sparkyfitness-plus (#2): with strength training off, the website hides its
// strength-only places; on (the default), everything shows as before.
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Exercise } from '@/types/exercises';
import { renderWithClient } from '../test-utils';
import AddExerciseDialog from '@/pages/Exercises/AddExerciseDialog';
import ExerciseSearch from '@/pages/Exercises/ExerciseSearch';
import EquipmentManager from '@/pages/Exercises/EquipmentManager';
import ExerciseDatabaseManager from '@/pages/Exercises/Exercises';
import { isCardioExercise } from '@/plus/features/strengthTraining';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

let mockStrengthOn = true;
jest.mock('@/plus/features/strengthTraining', () => {
  const actual = jest.requireActual('@/plus/features/strengthTraining');
  return {
    ...actual,
    useStrengthTrainingEnabled: () => mockStrengthOn,
    useStrengthExerciseFilter:
      () =>
      <T extends Parameters<typeof actual.isCardioExercise>[0]>(items: T[]) =>
        mockStrengthOn ? items : items.filter(actual.isCardioExercise),
  };
});

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit: 'kg',
    distanceUnit: 'km',
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    convertDistance: (value: number) => value,
  }),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({
    hasWritePermission: () => true,
    isActingOnBehalf: false,
  }),
}));

// --- AddExerciseDialog's tabs ---
jest.mock('@/pages/Exercises/WorkoutPresetSelector', () => () => (
  <div>preset selector</div>
));
jest.mock('@/pages/Exercises/AddCustomExerciseForm', () => () => null);
jest.mock('@/pages/Exercises/ExerciseAlternativesPanel', () => () => null);
jest.mock('@/hooks/Exercises/useAddCustomExerciseForm', () => ({
  useAddCustomExerciseForm: () => ({}),
}));

// --- ExerciseSearch ---
const exercise = (overrides: Partial<Exercise>): Exercise => ({
  id: 'exercise-1',
  name: 'Exercise',
  category: null,
  modality: null,
  images: null,
  primary_muscles: null,
  secondary_muscles: null,
  equipment: null,
  instructions: null,
  force: null,
  level: null,
  mechanic: null,
  ...overrides,
});
const benchPress = exercise({
  id: 'bench',
  name: 'Bench Press',
  category: 'strength',
  equipment: ['barbell'],
});
const ride = exercise({ id: 'ride', name: 'Cycling', category: 'Cardio' });
const plank = exercise({ id: 'plank', name: 'Plank', category: 'isometric' });

jest.mock('@/hooks/Exercises/useExerciseSearchHook', () => ({
  useExerciseSearchHook: () => ({
    exercises: [],
    recentExercises: [benchPress, ride, plank],
    topExercises: [],
    loading: false,
    searchSource: 'internal',
    providers: [],
    selectedProviderId: null,
    equipmentFilter: [],
    muscleGroupFilter: [],
    hasSearchedExternal: false,
    availableMuscleGroups: ['chest'],
    availableEquipment: ['barbell'],
    searchTerm: '',
    selectedProviderType: null,
    handleSearch: jest.fn(),
    handleAddExternalExercise: jest.fn(),
    handleEquipmentToggle: jest.fn(),
    handleMuscleToggle: jest.fn(),
    setSelectedProviderId: jest.fn(),
    setSelectedProviderType: jest.fn(),
    setHasSearchedExternal: jest.fn(),
    setSearchTerm: jest.fn(),
  }),
}));
jest.mock('@/pages/Exercises/BodyMapFilter', () => () => (
  <div data-testid="body-map" />
));
jest.mock('@/pages/Exercises/ExerciseSearchListItem', () => ({
  ExerciseSearchListItem: ({ exercise }: { exercise: Exercise }) => (
    <div>{exercise.name}</div>
  ),
}));

// --- EquipmentManager ---
jest.mock('@/hooks/Shoes/useShoes', () => ({
  useShoes: () => ({ data: [], isLoading: false }),
  useCreateShoeMutation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateShoeMutation: () => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useDeleteShoeMutation: () => ({ mutate: jest.fn() }),
}));
jest.mock('@/hooks/PlateInventory/usePlateInventory', () => ({
  usePlateInventory: () => ({ data: null, isLoading: false }),
  useSavePlateInventoryMutation: () => ({
    mutateAsync: jest.fn(),
    isPending: false,
  }),
  useResetPlateInventoryMutation: () => ({ mutate: jest.fn() }),
}));

// --- Exercises page ---
jest.mock('@/pages/Exercises/WorkoutPresetsManager', () => () => (
  <div>Workout presets section</div>
));
jest.mock('@/pages/Exercises/WorkoutPlansManager', () => () => (
  <div>Workout plans section</div>
));
jest.mock(
  '@/pages/Exercises/TrainingPrograms/TrainingProgramsEntry',
  () => () => <div>Training programs section</div>
);
jest.mock('@/pages/Exercises/EditExerciseDialog', () => () => null);
jest.mock('@/hooks/Exercises/useExercises', () => ({
  useExercises: () => ({ data: { exercises: [], totalCount: 0 } }),
  useUpdateExerciseShareStatusMutation: () => ({ mutateAsync: jest.fn() }),
}));
jest.mock('@/hooks/Exercises/useEditExerciseForm', () => ({
  useEditExerciseForm: () => ({
    showSyncConfirmation: false,
    setShowSyncConfirmation: jest.fn(),
    handleSyncConfirmation: jest.fn(),
  }),
}));
jest.mock('@/hooks/Exercises/useDeleteExercise', () => ({
  useDeleteExercise: () => ({
    showDeleteConfirmation: false,
    setShowDeleteConfirmation: jest.fn(),
    deletionImpact: null,
    exerciseToDelete: null,
    handleDeleteRequest: jest.fn(),
    confirmDelete: jest.fn(),
    deleteExercise: jest.fn(),
  }),
}));

beforeEach(() => {
  mockStrengthOn = true;
});

describe('isCardioExercise', () => {
  it('follows the exercise modality, explicit or derived', () => {
    expect(isCardioExercise(ride)).toBe(true);
    expect(isCardioExercise(exercise({ category: 'cardio' }))).toBe(true);
    expect(isCardioExercise(benchPress)).toBe(false);
    expect(isCardioExercise(plank)).toBe(false);
    expect(
      isCardioExercise(
        exercise({ category: 'general', modality: 'duration_distance' })
      )
    ).toBe(true);
    expect(
      isCardioExercise(
        exercise({ category: 'Cardio', modality: 'weight_reps' })
      )
    ).toBe(false);
  });
});

describe('Add exercise dialog', () => {
  const renderDialog = () =>
    render(
      <AddExerciseDialog
        open
        onOpenChange={jest.fn()}
        onExerciseAdded={jest.fn()}
        mode="diary"
      />
    );

  it('offers workout presets while strength training is on', () => {
    renderDialog();
    expect(
      screen.getByRole('tab', { name: 'Workout Preset' })
    ).toBeInTheDocument();
  });

  it('hides workout presets while strength training is off', () => {
    mockStrengthOn = false;
    renderDialog();
    expect(
      screen.queryByRole('tab', { name: 'Workout Preset' })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'My Exercises' })
    ).toBeInTheDocument();
  });
});

describe('Exercise search', () => {
  const renderSearch = () =>
    render(<ExerciseSearch onExerciseSelect={jest.fn()} />);

  it('lists every exercise with the muscle and equipment filters while on', () => {
    renderSearch();
    expect(screen.getByText('Bench Press')).toBeInTheDocument();
    expect(screen.getByText('Plank')).toBeInTheDocument();
    expect(screen.getByText('Cycling')).toBeInTheDocument();
    expect(screen.getByTestId('body-map')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /barbell/i })
    ).toBeInTheDocument();
  });

  it('lists only cardio exercises, without strength filters, while off', () => {
    mockStrengthOn = false;
    renderSearch();
    expect(screen.getByText('Cycling')).toBeInTheDocument();
    expect(screen.queryByText('Bench Press')).not.toBeInTheDocument();
    expect(screen.queryByText('Plank')).not.toBeInTheDocument();
    expect(screen.queryByTestId('body-map')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /barbell/i })
    ).not.toBeInTheDocument();
  });
});

describe('Equipment', () => {
  it('shows plates & bars while strength training is on', () => {
    renderWithClient(<EquipmentManager />);
    expect(screen.getByText('Plates & bars')).toBeInTheDocument();
  });

  it('keeps shoes and hides plates & bars while off', () => {
    mockStrengthOn = false;
    renderWithClient(<EquipmentManager />);
    expect(screen.queryByText('Plates & bars')).not.toBeInTheDocument();
    expect(screen.getByText(/No shoes yet/i)).toBeInTheDocument();
  });
});

describe('Exercises page', () => {
  it('shows presets, plans and training programs while on', () => {
    renderWithClient(<ExerciseDatabaseManager />);
    expect(screen.getByText('Workout presets section')).toBeInTheDocument();
    expect(screen.getByText('Workout plans section')).toBeInTheDocument();
    expect(screen.getByText('Training programs section')).toBeInTheDocument();
  });

  it('hides presets and plans, keeping run and walk programs, while off', () => {
    mockStrengthOn = false;
    renderWithClient(<ExerciseDatabaseManager />);
    expect(
      screen.queryByText('Workout presets section')
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Workout plans section')).not.toBeInTheDocument();
    expect(screen.getByText('Training programs section')).toBeInTheDocument();
  });
});
