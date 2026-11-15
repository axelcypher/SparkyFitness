// sparkyfitness-plus (#2): the website's optional-feature switches.
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FeatureChoices } from '@workspace/shared';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import {
  plusFeatureChoicesKey,
  usePlusFeatureEnabled,
  useSetPlusFeature,
} from '@/hooks/plus/useFeatureChoices';
import { PlusFeaturesSettings } from '@/plus/features/PlusFeaturesSettings';
import {
  getFeatureChoices,
  patchFeatureChoices,
} from '@/api/plus/featureChoices';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/api/plus/featureChoices', () => ({
  getFeatureChoices: jest.fn(),
  patchFeatureChoices: jest.fn(),
}));

let mockActingOnBehalf = false;
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: mockActingOnBehalf }),
}));

const mockGet = getFeatureChoices as jest.MockedFunction<
  typeof getFeatureChoices
>;
const mockPatch = patchFeatureChoices as jest.MockedFunction<
  typeof patchFeatureChoices
>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function renderSettings() {
  const { wrapper: Wrapper } = createWrapper();
  return render(
    <Wrapper>
      <Accordion type="multiple" defaultValue={['plus-features']}>
        <AccordionItem value="plus-features">
          <PlusFeaturesSettings />
        </AccordionItem>
      </Accordion>
    </Wrapper>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockActingOnBehalf = false;
});

describe('usePlusFeatureEnabled', () => {
  it.each<[string, FeatureChoices, boolean]>([
    ['no choices', {}, true],
    ['turned off on the website', { web: { strengthTraining: false } }, false],
    [
      'turned off only in the app',
      { mobile: { strengthTraining: false } },
      true,
    ],
    ['turned on again', { web: { strengthTraining: true } }, true],
  ])('strength training with %s', async (_label, choices, expected) => {
    mockGet.mockResolvedValue(choices);
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => usePlusFeatureEnabled('strengthTraining'),
      { wrapper }
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    await waitFor(() => expect(result.current).toBe(expected));
  });

  it('stays on while loading and when the choices fail to load', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => usePlusFeatureEnabled('strengthTraining'),
      { wrapper }
    );
    expect(result.current).toBe(true);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(result.current).toBe(true);
  });

  it('uses the defaults while acting for someone else, without asking', () => {
    mockActingOnBehalf = true;
    const { wrapper } = createWrapper();
    const { result } = renderHook(
      () => usePlusFeatureEnabled('strengthTraining'),
      { wrapper }
    );
    expect(result.current).toBe(true);
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('useSetPlusFeature', () => {
  it('saves only the website key and updates the gate at once', async () => {
    mockGet.mockResolvedValue({ mobile: { strengthTraining: false } });
    mockPatch.mockResolvedValue({
      web: { strengthTraining: false },
      mobile: { strengthTraining: false },
    });
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(
      () => ({
        enabled: usePlusFeatureEnabled('strengthTraining'),
        set: useSetPlusFeature(),
      }),
      { wrapper }
    );
    await waitFor(() =>
      expect(queryClient.getQueryData(plusFeatureChoicesKey)).toBeDefined()
    );
    expect(result.current.enabled).toBe(true);

    act(() => result.current.set.setFeature('strengthTraining', false));

    expect(
      queryClient.getQueryData<FeatureChoices>(plusFeatureChoicesKey)
    ).toEqual({
      web: { strengthTraining: false },
      mobile: { strengthTraining: false },
    });
    await waitFor(() => expect(result.current.enabled).toBe(false));
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith({
        web: { strengthTraining: false },
      })
    );
  });

  it('saves nothing before the choices have loaded', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSetPlusFeature(), { wrapper });
    act(() => result.current.setFeature('strengthTraining', false));
    expect(mockPatch).not.toHaveBeenCalled();
  });
});

describe('PlusFeaturesSettings', () => {
  it('lists the strength training switch, on by default', async () => {
    mockGet.mockResolvedValue({});
    renderSettings();
    const toggle = await screen.findByLabelText('Strength training');
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toBeChecked();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(screen.queryByLabelText('Cycle')).not.toBeInTheDocument();
  });

  it('shows the website choice and turns it back on', async () => {
    mockGet.mockResolvedValue({ web: { strengthTraining: false } });
    mockPatch.mockResolvedValue({ web: { strengthTraining: true } });
    renderSettings();
    const toggle = await screen.findByLabelText('Strength training');
    await waitFor(() => expect(toggle).not.toBeChecked());

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith({
        web: { strengthTraining: true },
      })
    );
    expect(toggle).toBeChecked();
  });

  it('cannot be changed while acting for someone else', () => {
    mockActingOnBehalf = true;
    renderSettings();
    expect(screen.getByLabelText('Strength training')).toBeDisabled();
    expect(
      screen.getByText('You can only change features on your own account.')
    ).toBeInTheDocument();
  });

  it('offers a retry when the choices fail to load', async () => {
    mockGet.mockRejectedValue(new Error('offline'));
    renderSettings();
    expect(
      await screen.findByText('Could not load your feature choices.')
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Strength training')).toBeDisabled();
    mockGet.mockResolvedValue({});
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });
});
