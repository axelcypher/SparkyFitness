import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import StatusView from '../components/StatusView';
import Switch from '../components/ui/Switch';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import {
  CHOICE_FEATURE_KEYS,
  isPlusFeatureOn,
  useFeatureChoices,
  useSetPlusFeature,
  type ChoiceFeatureKey,
} from '../plus/features/useFeatureChoices';

type Translator = (key: string, options: { defaultValue: string }) => string;

/**
 * A feature's name and what turning it off hides. Resolvers rather than key
 * strings because the i18n audit needs the literal key at the call site; a
 * total record so a feature added without text is a compile error.
 */
const FEATURE_TEXT: Record<
  ChoiceFeatureKey,
  { label: (t: Translator) => string; description: (t: Translator) => string }
> = {
  strengthTraining: {
    label: (t) =>
      t('plus.features.strengthTraining.label', {
        defaultValue: 'Strength training',
      }),
    description: (t) =>
      t('plus.features.strengthTraining.description', {
        defaultValue:
          'Live and logged strength workouts, workout presets and plans, plates & bars and strength statistics. Activities, routes and cardio always show.',
      }),
  },
};

type Props = RootStackScreenProps<'PlusFeatures'>;

/**
 * Settings > Features (sparkyfitness-plus #2, fork-owned file): turn whole features on or off
 * in the mobile app. Cycle keeps its own switch in its settings.
 */
const PlusFeaturesScreen: React.FC<Props> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { choices, isLoaded, isLoading, isError, refetch } =
    useFeatureChoices();
  const { setFeature } = useSetPlusFeature(() =>
    Toast.show({
      type: 'error',
      text1: t('common.error', { defaultValue: 'Error' }),
      text2: t('plus.features.saveError', {
        defaultValue: 'Could not save your feature choice. Please try again.',
      }),
    })
  );

  const header = useScreenHeader({
    title: t('plus.features.title', { defaultValue: 'Features' }),
    left: { kind: 'back' },
  });

  const renderContent = () => {
    if (isLoading) {
      return <StatusView inline loading />;
    }
    if (isError && !isLoaded) {
      return (
        <StatusView
          inline
          icon="alert-circle"
          iconTone="danger"
          title={t('plus.features.loadError', {
            defaultValue: 'Could not load your feature choices.',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
          }}
        />
      );
    }
    return (
      <SettingsRowGroup>
        {CHOICE_FEATURE_KEYS.map((key) => {
          const label = FEATURE_TEXT[key].label(t);
          return (
            <SettingsRow
              key={key}
              title={label}
              subtitle={FEATURE_TEXT[key].description(t)}
              subtitleNumberOfLines={0}
              testID={`plus-feature-${key}`}
              rightAccessory={
                <Switch
                  accessibilityLabel={label}
                  value={isPlusFeatureOn(key, choices)}
                  disabled={!isLoaded}
                  onValueChange={(enabled) => setFeature(key, enabled)}
                />
              }
            />
          );
        })}
      </SettingsRowGroup>
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        {renderContent()}
        <Text className="text-sm text-text-secondary mt-2">
          {t('plus.features.footnote', {
            defaultValue:
              'Turning a feature off only hides it in this app: nothing is deleted, and the website keeps its own settings.',
          })}
        </Text>
      </ScrollView>
    </View>
  );
};

export default PlusFeaturesScreen;
