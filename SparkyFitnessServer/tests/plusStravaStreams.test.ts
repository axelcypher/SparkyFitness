// sparkyfitness-plus (#4): GPS tracks for Strava activities from the streams API.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { getClient, getSystemClient } from '../db/poolManager.js';
import { _bulkInsertExerciseEntryGpsPointsWithClient } from '../models/workoutTelemetryRepository.js';
import stravaIntegrationService from '../integrations/strava/stravaService.js';
import stravaDataProcessor from '../integrations/strava/stravaDataProcessor.js';
import stravaService from '../services/stravaService.js';
import {
  activityHasGpsTrack,
  mapStravaStreamsToGpsPoints,
  plusSyncStravaGpsTracks,
  type PlusStravaActivity,
  type StravaStreamSet,
} from '../integrations/strava/plusStravaStreams.js';

vi.mock('axios');
vi.mock('../db/poolManager.js');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/workoutTelemetryRepository.js');
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../integrations/strava/stravaService.js');
vi.mock('../integrations/strava/stravaDataProcessor.js');

const START = '2026-11-10T08:00:00Z';

const streams: StravaStreamSet = {
  time: { data: [0, 1, 2] },
  latlng: {
    data: [
      [52.52, 13.405],
      [52.5201, 13.4051],
      [52.5202, 13.4052],
    ],
  },
  altitude: { data: [34, 34.5, 35] },
  distance: { data: [0, 12.3, 24.6] },
  heartrate: { data: [120, 122, 125] },
  cadence: { data: [80, 82, 84] },
  watts: { data: [150, 160, 170] },
  velocity_smooth: { data: [0, 12.3, 12.3] },
};

const ride = (id: number, startDate = START): PlusStravaActivity => ({
  id,
  name: `Ride ${id}`,
  sport_type: 'Ride',
  start_date: startDate,
  start_latlng: [52.52, 13.405],
  map: { summary_polyline: 'abc' },
  trainer: false,
  manual: false,
});

const httpError = (status: number) =>
  Object.assign(new Error(`status ${status}`), { response: { status } });

type EntryRow = {
  id: string;
  entry_date: string;
  source_id: string;
  has_track: boolean;
};

let entryRows: EntryRow[];
let query: ReturnType<typeof vi.fn>;

function entry(activityId: number, hasTrack = false): EntryRow {
  return {
    id: `entry-${activityId}`,
    entry_date: '2026-11-10',
    source_id: String(activityId),
    has_track: hasTrack,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  entryRows = [];
  query = vi.fn(async (sql: string) =>
    /FROM exercise_entries/.test(sql) ? { rows: entryRows } : { rows: [] }
  );
  vi.mocked(getClient).mockResolvedValue({
    query,
    release: vi.fn(),
  } as never);
  vi.mocked(axios.get).mockResolvedValue({ data: streams, headers: {} });
});

describe('mapStravaStreamsToGpsPoints', () => {
  it('maps every stream onto the stored point shape', () => {
    const points = mapStravaStreamsToGpsPoints(streams, START);
    expect(points).toHaveLength(3);
    expect(points[1]).toEqual({
      t: '2026-11-10T08:00:01.000Z',
      lat: 52.5201,
      lon: 13.4051,
      alt: 34.5,
      dist: 12.3,
      hr: 122,
      cad: 82,
      power: 160,
      speed: 12.3,
    });
  });

  it('omits sensors that are missing and skips points without a position', () => {
    const points = mapStravaStreamsToGpsPoints(
      {
        time: { data: [0, 5, 10] },
        latlng: { data: [[48.1, 11.5], null, [48.2, 11.6]] },
      } as never,
      START
    );
    expect(points).toEqual([
      { t: '2026-11-10T08:00:00.000Z', lat: 48.1, lon: 11.5 },
      { t: '2026-11-10T08:00:10.000Z', lat: 48.2, lon: 11.6 },
    ]);
  });

  it('returns no points without a latlng or time stream', () => {
    expect(
      mapStravaStreamsToGpsPoints({ time: { data: [0, 1] } }, START)
    ).toEqual([]);
    expect(
      mapStravaStreamsToGpsPoints({ latlng: { data: [[1, 2]] } }, START)
    ).toEqual([]);
    expect(mapStravaStreamsToGpsPoints(streams, 'not a date')).toEqual([]);
  });
});

describe('activityHasGpsTrack', () => {
  it('accepts outdoor activities with a start position or a map', () => {
    expect(activityHasGpsTrack(ride(1))).toBe(true);
    expect(
      activityHasGpsTrack({
        ...ride(1),
        start_latlng: [],
        map: { summary_polyline: 'x' },
      })
    ).toBe(true);
    expect(
      activityHasGpsTrack({ ...ride(1), map: { summary_polyline: '' } })
    ).toBe(true);
  });

  it('rejects trainer, manual, virtual and position-less activities', () => {
    expect(activityHasGpsTrack({ ...ride(1), trainer: true })).toBe(false);
    expect(activityHasGpsTrack({ ...ride(1), manual: true })).toBe(false);
    expect(activityHasGpsTrack({ ...ride(1), sport_type: 'VirtualRide' })).toBe(
      false
    );
    expect(
      activityHasGpsTrack({
        id: 1,
        start_date: START,
        start_latlng: [],
        map: { summary_polyline: null },
      })
    ).toBe(false);
  });
});

describe('plusSyncStravaGpsTracks', () => {
  it('fetches the streams and stores the track in its own transaction', async () => {
    entryRows = [entry(11)];

    const summary = await plusSyncStravaGpsTracks(
      'user-1',
      'token',
      [ride(11)],
      {},
      {
        delayMs: 0,
      }
    );

    expect(summary).toMatchObject({ stored: 1, failed: 0, skippedBudget: 0 });
    expect(axios.get).toHaveBeenCalledWith(
      'https://www.strava.com/api/v3/activities/11/streams',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token' },
        params: {
          keys: 'time,latlng,altitude,distance,heartrate,cadence,watts,velocity_smooth',
          key_by_type: true,
        },
      })
    );
    const sqls = query.mock.calls.map((c) => c[0]);
    expect(sqls).toContain('BEGIN');
    expect(sqls).toContain('COMMIT');
    const rows = vi.mocked(_bulkInsertExerciseEntryGpsPointsWithClient).mock
      .calls[0]![2];
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      user_id: 'user-1',
      exercise_entry_id: 'entry-11',
      entry_date: '2026-11-10',
      latitude: 52.52,
      longitude: 13.405,
      altitude_meters: 34,
      heart_rate_bpm: 120,
      cadence: 80,
      power_watts: 150,
      speed_mps: 0,
      distance_meters: 0,
    });
    expect(rows[0]!.timestamp.toISOString()).toBe('2026-11-10T08:00:00.000Z');
  });

  it('touches neither Strava nor the database for activities without GPS', async () => {
    const summary = await plusSyncStravaGpsTracks(
      'user-1',
      'token',
      [
        { ...ride(1), trainer: true },
        {
          id: 2,
          name: 'Weights',
          sport_type: 'WeightTraining',
          start_date: START,
        },
      ],
      {},
      { delayMs: 0 }
    );

    expect(summary.stored).toBe(0);
    expect(getClient).not.toHaveBeenCalled();
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('uses the detailed activity when the summary lacks the GPS hints', async () => {
    entryRows = [entry(5)];
    const summary = await plusSyncStravaGpsTracks(
      'user-1',
      'token',
      [{ id: 5, name: 'Hike', start_date: START }],
      { 5: { start_latlng: [47.1, 11.2], trainer: false, manual: false } },
      { delayMs: 0 }
    );
    expect(summary.stored).toBe(1);
  });

  it('skips activities whose entry already has a track', async () => {
    entryRows = [entry(11, true)];

    const summary = await plusSyncStravaGpsTracks(
      'user-1',
      'token',
      [ride(11)],
      {},
      {
        delayMs: 0,
      }
    );

    expect(summary).toMatchObject({ stored: 0, alreadyHadTrack: 1 });
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('skips activities that have no saved entry', async () => {
    const summary = await plusSyncStravaGpsTracks(
      'user-1',
      'token',
      [ride(11)],
      {},
      {
        delayMs: 0,
      }
    );
    expect(summary).toMatchObject({ stored: 0, noEntry: 1 });
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('fetches at most the per-sync budget, newest activities first', async () => {
    entryRows = [entry(1), entry(2), entry(3)];

    const summary = await plusSyncStravaGpsTracks(
      'user-1',
      'token',
      [
        ride(1, '2026-11-08T08:00:00Z'),
        ride(2, '2026-11-09T08:00:00Z'),
        ride(3, '2026-11-10T08:00:00Z'),
      ],
      {},
      { budget: 2, delayMs: 0 }
    );

    expect(summary).toMatchObject({ stored: 2, skippedBudget: 1 });
    const urls = vi.mocked(axios.get).mock.calls.map((c) => c[0]);
    expect(urls).toEqual([
      'https://www.strava.com/api/v3/activities/3/streams',
      'https://www.strava.com/api/v3/activities/2/streams',
    ]);
  });

  it('stops fetching streams for the run after a 429', async () => {
    entryRows = [entry(1), entry(2), entry(3)];
    vi.mocked(axios.get).mockRejectedValueOnce(httpError(429));

    const summary = await plusSyncStravaGpsTracks(
      'user-1',
      'token',
      [ride(1), ride(2), ride(3)],
      {},
      { delayMs: 0 }
    );

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ stored: 0, skippedRateLimited: 3 });
    expect(_bulkInsertExerciseEntryGpsPointsWithClient).not.toHaveBeenCalled();
  });

  it('stops when the rate-limit headers show the window nearly used up', async () => {
    entryRows = [entry(1), entry(2)];
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: streams,
      headers: {
        'x-readratelimit-limit': '100,1000',
        'x-readratelimit-usage': '95,300',
      },
    });

    const summary = await plusSyncStravaGpsTracks(
      'user-1',
      'token',
      [ride(1), ride(2)],
      {},
      { delayMs: 0 }
    );

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ stored: 1, skippedRateLimited: 1 });
  });

  it('keeps going after one stream fails and never throws', async () => {
    entryRows = [entry(1), entry(2)];
    vi.mocked(axios.get).mockRejectedValueOnce(httpError(500));

    const summary = await plusSyncStravaGpsTracks(
      'user-1',
      'token',
      [ride(1, '2026-11-10T09:00:00Z'), ride(2, '2026-11-10T08:00:00Z')],
      {},
      { delayMs: 0 }
    );

    expect(summary).toMatchObject({ stored: 1, failed: 1 });
  });

  it('rolls back only the track when storing it fails', async () => {
    entryRows = [entry(1)];
    vi.mocked(
      _bulkInsertExerciseEntryGpsPointsWithClient
    ).mockRejectedValueOnce(new Error('db down'));

    const summary = await plusSyncStravaGpsTracks(
      'user-1',
      'token',
      [ride(1)],
      {},
      {
        delayMs: 0,
      }
    );

    expect(summary).toMatchObject({ stored: 0, failed: 1 });
    const sqls = query.mock.calls.map((c) => c[0]);
    expect(sqls).toContain('ROLLBACK');
    expect(sqls.some((s: string) => /DELETE/i.test(s))).toBe(false);
  });

  it('resolves even when the entry lookup fails', async () => {
    vi.mocked(getClient).mockRejectedValueOnce(new Error('no connection'));
    await expect(
      plusSyncStravaGpsTracks('user-1', 'token', [ride(1)], {}, { delayMs: 0 })
    ).resolves.toMatchObject({ stored: 0 });
  });
});

describe('Strava sync with GPS tracks', () => {
  it('keeps the summary entry and marks the sync done when the stream fetch fails', async () => {
    const systemQuery = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getSystemClient).mockResolvedValue({
      query: systemQuery,
      release: vi.fn(),
    } as never);
    vi.mocked(stravaIntegrationService.getValidAccessToken).mockResolvedValue(
      'token' as never
    );
    vi.mocked(stravaIntegrationService.fetchAthlete).mockResolvedValue(
      null as never
    );
    vi.mocked(
      stravaIntegrationService.fetchAllActivitiesInRange
    ).mockResolvedValue([ride(42)] as never);
    vi.mocked(stravaIntegrationService.fetchActivityById).mockResolvedValue(
      null as never
    );
    vi.mocked(stravaDataProcessor.processStravaActivities).mockResolvedValue({
      processed: 1,
      failed: 0,
    });
    entryRows = [entry(42)];
    vi.mocked(axios.get).mockRejectedValue(httpError(500));

    const result = await stravaService.syncStravaData(
      'user-1',
      'manual',
      '2026-11-10' as never,
      '2026-11-10' as never
    );

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      activitiesProcessed: 1,
      activitiesFailed: 0,
    });
    // last_sync_at is still updated: a missing track never blocks the sync.
    expect(systemQuery).toHaveBeenCalledWith(
      expect.stringContaining('last_sync_at'),
      ['user-1']
    );
    const sqls = query.mock.calls.map((c) => c[0]);
    expect(sqls.some((s: string) => /DELETE|ROLLBACK/i.test(s))).toBe(false);
  });
});
