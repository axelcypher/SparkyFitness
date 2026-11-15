// sparkyfitness-plus (#2): with strength training off, the app hides its
// strength-only places; on (the default), everything shows as before.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import AddSheet from '../../src/components/AddSheet';
import EquipmentScreen from '../../src/screens/EquipmentScreen';
import { isCardioExercise } from '../../src/plus/features/strengthTraining';
import { __resetAppPreferencesStoreForTests } from '../../src/stores/appPreferencesStore';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

let mockStrengthOn = true;
jest.mock('../../src/plus/features/strengthTraining', () => {
  const actual = jest.requireActual('../../src/plus/features/strengthTraining');
  return {
    ...actual,
    useStrengthTrainingEnabled: () => mockStrengthOn,
  };
});

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BottomSheetModal: React.forwardRef(({ children }: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        present: jest.fn(),
        dismiss: jest.fn(),
      }));
      return React.createElement(View, null, children);
    }),
    BottomSheetView: ({ children }: any) =>
      React.createElement(View, null, children),
    BottomSheetBackdrop: () => null,
  };
});
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

beforeAll(async () => {
  await initializeI18n();
});

beforeEach(() => {
  mockStrengthOn = true;
  __resetAppPreferencesStoreForTests();
});

describe('isCardioExercise', () => {
  it('follows the exercise modality, explicit or derived', () => {
    expect(isCardioExercise({ category: 'Cardio', equipment: [] })).toBe(true);
    expect(isCardioExercise({ category: 'strength', equipment: [] })).toBe(
      false
    );
    expect(isCardioExercise({ category: 'isometric' })).toBe(false);
    expect(
      isCardioExercise({ category: 'general', modality: 'duration_distance' })
    ).toBe(true);
  });
});

describe('Add sheet exercise menu', () => {
  const renderSheet = () =>
    render(
      <AddSheet
        onAddFood={jest.fn()}
        onStartWorkout={jest.fn()}
        onAddActivity={jest.fn()}
        onLogWorkout={jest.fn()}
        onSyncHealthData={jest.fn()}
        onBarcodeScan={jest.fn()}
        onAddMeasurements={jest.fn()}
        onRecordActivity={jest.fn()}
      />
    );

  it('offers live and logged workouts while strength training is on', () => {
    renderSheet();
    fireEvent.press(screen.getByText('Exercise'));
    expect(screen.getByText('Workout')).toBeTruthy();
    expect(screen.getByText('Log Workout')).toBeTruthy();
    expect(screen.getByText('Activity')).toBeTruthy();
  });

  it('keeps activities and GPS recording only while it is off', () => {
    mockStrengthOn = false;
    renderSheet();
    fireEvent.press(screen.getByText('Exercise'));
    expect(screen.queryByText('Workout')).toBeNull();
    expect(screen.queryByText('Log Workout')).toBeNull();
    expect(screen.getByText('Activity')).toBeTruthy();
    expect(screen.getByText('Record Activity')).toBeTruthy();
  });
});

describe('Equipment', () => {
  const props = {
    navigation: { navigate: jest.fn() },
  } as unknown as RootStackScreenProps<'Equipment'>;

  it('lists plates & bars while strength training is on', () => {
    render(<EquipmentScreen {...props} />);
    expect(screen.getByTestId('equipment-plates')).toBeTruthy();
  });

  it('keeps shoes and hides plates & bars while it is off', () => {
    mockStrengthOn = false;
    render(<EquipmentScreen {...props} />);
    expect(screen.queryByTestId('equipment-plates')).toBeNull();
    expect(screen.getByTestId('equipment-shoes')).toBeTruthy();
  });
});
