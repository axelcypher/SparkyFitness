// sparkyfitness-plus (#2): Settings > Features and the feature-choice hooks.
import React from 'react';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FeatureChoices } from '@workspace/shared';

import PlusFeaturesScreen from '../../src/screens/PlusFeaturesScreen';
import {
  plusFeatureChoicesQueryKey,
  usePlusFeatureEnabled,
  useSetPlusFeature,
} from '../../src/plus/features/useFeatureChoices';
import {
  fetchFeatureChoices,
  patchFeatureChoices,
} from '../../src/plus/features/featureChoicesApi';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/plus/features/featureChoicesApi', () => ({
  fetchFeatureChoices: jest.fn(),
  patchFeatureChoices: jest.fn(),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

const mockFetch = jest.mocked(fetchFeatureChoices);
const mockPatch = jest.mocked(patchFeatureChoices);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function renderScreen() {
  const { wrapper: Wrapper } = createWrapper();
  return render(
    <Wrapper>
      <PlusFeaturesScreen {...({ navigation: {}, route: {} } as never)} />
    </Wrapper>
  );
}

beforeAll(async () => {
  await initializeI18n();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('usePlusFeatureEnabled', () => {
  it.each<[string, FeatureChoices, boolean]>([
    ['no choices', {}, true],
    ['turned off in the app', { mobile: { strengthTraining: false } }, false],
    [
      'turned off only on the website',
      { web: { strengthTraining: false } },
      true,
    ],
  ])('strength training with %s', async (_label, choices, expected) => {
    mockFetch.mockResolvedValue(choices);
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(
      () => usePlusFeatureEnabled('strengthTraining'),
      { wrapper }
    );
    await waitFor(() =>
      expect(queryClient.getQueryData(plusFeatureChoicesQueryKey)).toBeDefined()
    );
    await waitFor(() => expect(result.current).toBe(expected));
  });

  it('stays on when the choices cannot be loaded', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(
      () => usePlusFeatureEnabled('strengthTraining'),
      { wrapper }
    );
    await waitFor(() =>
      expect(
        queryClient.getQueryState(plusFeatureChoicesQueryKey)?.status
      ).toBe('error')
    );
    expect(result.current).toBe(true);
  });

  it('saves only the app key and does nothing before the choices load', async () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSetPlusFeature(), { wrapper });
    act(() => result.current.setFeature('strengthTraining', false));
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe('PlusFeaturesScreen', () => {
  it('lists the strength training switch, on by default', async () => {
    mockFetch.mockResolvedValue({});
    renderScreen();
    expect(await screen.findByText('Strength training')).toBeTruthy();
    const toggle = screen.getByLabelText('Strength training');
    await waitFor(() => expect(toggle.props.disabled).toBeFalsy());
    expect(toggle.props.value).toBe(true);
    expect(screen.queryByText('Cycle')).toBeNull();
  });

  it('turns strength training off for the app only', async () => {
    mockFetch.mockResolvedValue({ web: { strengthTraining: true } });
    mockPatch.mockResolvedValue({
      web: { strengthTraining: true },
      mobile: { strengthTraining: false },
    });
    renderScreen();
    const toggle = await screen.findByLabelText('Strength training');
    await waitFor(() => expect(toggle.props.disabled).toBeFalsy());

    fireEvent(toggle, 'valueChange', false);

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith({
        mobile: { strengthTraining: false },
      })
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Strength training').props.value).toBe(false)
    );
  });

  it('offers a retry when the choices fail to load', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    renderScreen();
    expect(
      await screen.findByText('Could not load your feature choices.')
    ).toBeTruthy();
    mockFetch.mockResolvedValue({});
    fireEvent.press(screen.getByText('Retry'));
    expect(await screen.findByText('Strength training')).toBeTruthy();
  });
});
