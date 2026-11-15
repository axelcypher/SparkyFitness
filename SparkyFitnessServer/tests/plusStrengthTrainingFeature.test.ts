// sparkyfitness-plus (#2): the strength training switch in the optional
// features registry.
import { describe, expect, it } from 'vitest';
import {
  FEATURE_PLATFORMS,
  OPTIONAL_FEATURES,
  featureChoicesPatchSchema,
  featureStorage,
  filterByFeature,
  isFeatureEnabled,
  isFeatureEnabledAnywhere,
  isFeatureExplicitlyOff,
  isFeatureKey,
  platformFeatureChoicesSchema,
  type FeatureKey,
} from '@workspace/shared';

describe('strengthTraining feature', () => {
  it('is a training feature, on by default, stored in feature_choices', () => {
    expect(isFeatureKey('strengthTraining')).toBe(true);
    expect(OPTIONAL_FEATURES.strengthTraining).toEqual({
      group: 'training',
      defaultEnabled: true,
      storage: 'choices',
    });
    expect(featureStorage('strengthTraining')).toBe('choices');
  });

  it.each(FEATURE_PLATFORMS)(
    'is on in %s for someone who never chose anything',
    (platform) => {
      for (const choices of [null, undefined, {}, { [platform]: {} }]) {
        const sources = { choices, cycleEnabled: null };
        expect(isFeatureEnabled('strengthTraining', platform, sources)).toBe(
          true
        );
        expect(
          isFeatureExplicitlyOff('strengthTraining', platform, sources)
        ).toBe(false);
      }
    }
  );

  it('turns off in one app only', () => {
    const sources = {
      choices: { web: { strengthTraining: false } },
      cycleEnabled: null,
    };
    expect(isFeatureEnabled('strengthTraining', 'web', sources)).toBe(false);
    expect(isFeatureExplicitlyOff('strengthTraining', 'web', sources)).toBe(
      true
    );
    expect(isFeatureEnabled('strengthTraining', 'mobile', sources)).toBe(true);
    expect(isFeatureEnabledAnywhere('strengthTraining', sources)).toBe(true);
    expect(
      isFeatureEnabledAnywhere('strengthTraining', {
        choices: {
          web: { strengthTraining: false },
          mobile: { strengthTraining: false },
        },
        cycleEnabled: null,
      })
    ).toBe(false);
  });

  it('can be stored and patched, and reset with null', () => {
    expect(
      platformFeatureChoicesSchema.safeParse({ strengthTraining: false })
        .success
    ).toBe(true);
    expect(
      featureChoicesPatchSchema.safeParse({
        mobile: { strengthTraining: null },
      }).success
    ).toBe(true);
  });

  it('filters items that declare it', () => {
    const items: { id: string; feature?: FeatureKey }[] = [
      { id: 'activity' },
      { id: 'presets', feature: 'strengthTraining' },
    ];
    expect(
      filterByFeature(items, (key) => key !== 'strengthTraining').map(
        (item) => item.id
      )
    ).toEqual(['activity']);
  });
});
