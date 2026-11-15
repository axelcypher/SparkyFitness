import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ToggleRight } from 'lucide-react';
import { AccordionContent, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  CHOICE_FEATURE_KEYS,
  type ChoiceFeatureKey,
  useFeatureChoices,
  useSetPlusFeature,
} from '@/hooks/plus/useFeatureChoices';
import { isFeatureEnabled } from '@workspace/shared';

/** A feature's name and what turning it off hides, keyed by registry id. */
const FEATURE_TEXT: Record<
  ChoiceFeatureKey,
  { label: (t: TFunction) => string; description: (t: TFunction) => string }
> = {
  strengthTraining: {
    label: (t) =>
      t('plus.features.strengthTraining.label', 'Strength training'),
    description: (t) =>
      t(
        'plus.features.strengthTraining.description',
        'Sets and reps, workout presets and plans, the workout player, the plate calculator and strength reports. Cardio and outdoor activities always show.'
      ),
  },
};

/**
 * Settings > Profile & Account > Features (sparkyfitness-plus #2): turn whole
 * features on or off on the website. Cycle keeps its own switch in the
 * Wellness settings tab.
 */
export const PlusFeaturesSettings = () => {
  const { t } = useTranslation();
  const { choices, editState, reload } = useFeatureChoices();
  const { setFeature } = useSetPlusFeature();

  return (
    <>
      <AccordionTrigger
        className="flex items-center gap-2 p-4 hover:no-underline"
        description={t(
          'plus.features.description',
          'Turn whole features on or off on the website'
        )}
      >
        <ToggleRight className="h-5 w-5" />
        {t('plus.features.title', 'Features')}
      </AccordionTrigger>
      <AccordionContent className="p-4 pt-0 space-y-4">
        {editState === 'actingOnBehalf' && (
          <p className="text-sm text-muted-foreground">
            {t(
              'plus.features.actingOnBehalf',
              'You can only change features on your own account.'
            )}
          </p>
        )}
        {editState === 'loadFailed' && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-destructive">
              {t(
                'plus.features.loadError',
                'Could not load your feature choices.'
              )}
            </p>
            <Button variant="outline" size="sm" onClick={reload}>
              {t('common.retry', 'Retry')}
            </Button>
          </div>
        )}
        {CHOICE_FEATURE_KEYS.map((key) => {
          const switchId = `plus-feature-${key}`;
          const text = FEATURE_TEXT[key];
          return (
            <div key={key} className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor={switchId}>{text.label(t)}</Label>
                <p className="text-sm text-muted-foreground">
                  {text.description(t)}
                </p>
              </div>
              <Switch
                id={switchId}
                checked={isFeatureEnabled(key, 'web', {
                  choices,
                  cycleEnabled: null,
                })}
                disabled={editState !== 'ready'}
                onCheckedChange={(enabled) => setFeature(key, enabled)}
              />
            </div>
          );
        })}
        <p className="text-sm text-muted-foreground">
          {t(
            'plus.features.footnote',
            'Turning a feature off only hides it on this website: nothing is deleted, and the mobile app keeps its own settings.'
          )}
        </p>
      </AccordionContent>
    </>
  );
};
