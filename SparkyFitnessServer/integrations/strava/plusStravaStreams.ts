// sparkyfitness-plus (#4): GPS tracks for Strava activities.
//
// Upstream's Strava sync stores summary metrics and laps only (see the note at the
// top of stravaTelemetryExtractors.ts). This module runs after those entries are
// saved: for each outdoor activity whose entry has no track yet it fetches
// `GET /activities/{id}/streams` and stores the points in exercise_entry_gps_points,
// the table Garmin and FIT imports write and `GET /api/health-data/workout-gps/:id`
// reads.
//
// Strava allows 100 read requests per 15 minutes and 1,000 per day by default, and
// the sync has already spent some on the activity list and details. Stream fetches
// are therefore capped per sync, stop at the first 429 or when Strava's rate-limit
// headers show the window nearly used up, and whatever is skipped is fetched by a
// later sync that covers the activity again: "has a track" is read from the GPS
// table itself, so nothing else needs remembering. Nothing here throws, and a track
// that fails is written (or rolled back) in its own transaction, never touching the
// summary entry.
import axios from 'axios';
import type { GpsTrackPoint } from '@workspace/shared';
import { getClient } from '../../db/poolManager.js';
import { log } from '../../config/logging.js';
import { describeError } from '../../utils/errors.js';
import { isShuttingDown } from '../../utils/shutdownHooks.js';
import {
  _bulkInsertExerciseEntryGpsPointsWithClient,
  type FlatGpsPointRow,
  type TelemetryDbClient,
} from '../../models/workoutTelemetryRepository.js';

const STRAVA_API_BASE_URL = 'https://www.strava.com/api/v3';
const STREAM_KEYS =
  'time,latlng,altitude,distance,heartrate,cadence,watts,velocity_smooth';

/** Stream requests one sync may spend; the rest waits for the next sync. */
export const STRAVA_STREAM_BUDGET_PER_SYNC = 20;
/** Stop once Strava reports this share of a rate-limit window used. */
const RATE_LIMIT_STOP_SHARE = 0.9;
/** Pause between stream requests, as the sync does between detail requests. */
const DEFAULT_DELAY_MS = 500;

/** The SummaryActivity / DetailedActivity fields this module reads. */
export interface PlusStravaActivity {
  id: number;
  name?: string;
  sport_type?: string;
  type?: string;
  start_date?: string;
  start_latlng?: unknown;
  map?: { summary_polyline?: string | null; polyline?: string | null } | null;
  trainer?: boolean;
  manual?: boolean;
}

interface StravaStream<T> {
  data?: T[];
}

/** `GET /activities/{id}/streams?key_by_type=true` response. */
export interface StravaStreamSet {
  time?: StravaStream<number>;
  latlng?: StravaStream<[number, number] | null>;
  altitude?: StravaStream<number | null>;
  distance?: StravaStream<number | null>;
  heartrate?: StravaStream<number | null>;
  cadence?: StravaStream<number | null>;
  watts?: StravaStream<number | null>;
  velocity_smooth?: StravaStream<number | null>;
}

export interface PlusStravaTrackSummary {
  stored: number;
  alreadyHadTrack: number;
  noEntry: number;
  noPoints: number;
  failed: number;
  skippedBudget: number;
  skippedRateLimited: number;
}

const isFiniteNumber = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

function isLatLng(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    isFiniteNumber(v[0]) &&
    isFiniteNumber(v[1]) &&
    Math.abs(v[0]) <= 90 &&
    Math.abs(v[1]) <= 180
  );
}

/**
 * True for an activity recorded with GPS: a start position or a map line, and not
 * an indoor trainer, a manual entry or a virtual (Zwift-style) ride or run, whose
 * coordinates belong to a game world.
 */
export function activityHasGpsTrack(activity: PlusStravaActivity): boolean {
  if (activity.trainer === true || activity.manual === true) return false;
  const sport = activity.sport_type || activity.type || '';
  if (sport.startsWith('Virtual')) return false;
  const polyline = activity.map?.summary_polyline || activity.map?.polyline;
  return isLatLng(activity.start_latlng) || Boolean(polyline);
}

/**
 * Turns Strava streams into track points: `t` is the activity start plus the
 * `time` offset in seconds; samples without a position are dropped and missing
 * sensors are left out of the point.
 */
export function mapStravaStreamsToGpsPoints(
  streams: StravaStreamSet,
  startDate: string
): GpsTrackPoint[] {
  const startMs = Date.parse(startDate);
  const times = streams.time?.data;
  const positions = streams.latlng?.data;
  if (!Number.isFinite(startMs) || !times || !positions) return [];

  const optional: Array<[keyof GpsTrackPoint, (number | null)[] | undefined]> =
    [
      ['alt', streams.altitude?.data],
      ['dist', streams.distance?.data],
      ['hr', streams.heartrate?.data],
      ['cad', streams.cadence?.data],
      ['power', streams.watts?.data],
      ['speed', streams.velocity_smooth?.data],
    ];

  const points: GpsTrackPoint[] = [];
  const count = Math.min(times.length, positions.length);
  for (let i = 0; i < count; i++) {
    const offset = times[i];
    const position = positions[i];
    if (!isFiniteNumber(offset) || !isLatLng(position)) continue;
    const point: GpsTrackPoint = {
      t: new Date(startMs + offset * 1000).toISOString(),
      lat: position[0],
      lon: position[1],
    };
    for (const [key, series] of optional) {
      const value = series?.[i];
      if (isFiniteNumber(value))
        (point as Record<string, unknown>)[key] = value;
    }
    points.push(point);
  }
  return points;
}

function toFlatRow(
  point: GpsTrackPoint,
  userId: string,
  entryId: string,
  entryDate: string
): FlatGpsPointRow {
  return {
    user_id: userId,
    exercise_entry_id: entryId,
    entry_date: entryDate,
    timestamp: new Date(point.t),
    latitude: point.lat,
    longitude: point.lon,
    altitude_meters: point.alt ?? null,
    distance_meters: point.dist ?? null,
    heart_rate_bpm: point.hr ?? null,
    cadence: point.cad ?? null,
    power_watts: point.power ?? null,
    speed_mps: point.speed ?? null,
  };
}

/**
 * Reads Strava's "15-minute,daily" usage and limit headers (the read limit when
 * present, else the overall one) and says whether either window is nearly full.
 */
function rateLimitNearlyUsed(
  headers: Record<string, unknown> | undefined
): boolean {
  if (!headers) return false;
  const pair = (name: string): number[] | null => {
    const raw = headers[name];
    if (typeof raw !== 'string') return null;
    const values = raw.split(',').map((v) => Number(v.trim()));
    return values.every(Number.isFinite) ? values : null;
  };
  const limit =
    pair('x-readratelimit-limit') ?? pair('x-ratelimit-limit') ?? null;
  const usage =
    pair('x-readratelimit-usage') ?? pair('x-ratelimit-usage') ?? null;
  if (!limit || !usage) return false;
  return limit.some(
    (max, i) => max > 0 && (usage[i] ?? 0) >= max * RATE_LIMIT_STOP_SHARE
  );
}

function httpStatus(error: unknown): number | undefined {
  const response = (error as { response?: { status?: unknown } } | null)
    ?.response;
  return typeof response?.status === 'number' ? response.status : undefined;
}

interface EntryTrackState {
  id: string;
  entry_date: string;
  source_id: string;
  has_track: boolean;
}

async function loadEntryTrackStates(
  userId: string,
  sourceIds: string[]
): Promise<Map<string, EntryTrackState>> {
  const client = await getClient(userId);
  try {
    const res = await client.query(
      `SELECT e.id, e.entry_date, e.source_id,
              EXISTS (
                SELECT 1 FROM exercise_entry_gps_points g
                WHERE g.exercise_entry_id = e.id
              ) AS has_track
         FROM exercise_entries e
        WHERE e.user_id = $1
          AND e.source = 'Strava'
          AND e.source_id = ANY($2::text[])`,
      [userId, sourceIds]
    );
    const states = new Map<string, EntryTrackState>();
    for (const row of res.rows as EntryTrackState[]) {
      states.set(String(row.source_id), row);
    }
    return states;
  } finally {
    client.release();
  }
}

async function saveTrack(userId: string, rows: FlatGpsPointRow[]) {
  const client = await getClient(userId);
  try {
    await client.query('BEGIN');
    try {
      await _bulkInsertExerciseEntryGpsPointsWithClient(
        client as unknown as TelemetryDbClient,
        userId,
        rows
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
  }
}

async function fetchStreams(accessToken: string, activityId: number) {
  const response = await axios.get(
    `${STRAVA_API_BASE_URL}/activities/${activityId}/streams`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { keys: STREAM_KEYS, key_by_type: true },
    }
  );
  return {
    streams: (response.data ?? {}) as StravaStreamSet,
    nearlyUsed: rateLimitNearlyUsed(
      response.headers as Record<string, unknown> | undefined
    ),
  };
}

/** The summary carries the GPS hints; the detail fills in any it lacks. */
function withDetailHints(
  activity: PlusStravaActivity,
  detail: Partial<PlusStravaActivity> | undefined
): PlusStravaActivity {
  if (!detail) return activity;
  return {
    ...activity,
    sport_type: activity.sport_type ?? detail.sport_type,
    start_date: activity.start_date ?? detail.start_date,
    start_latlng: isLatLng(activity.start_latlng)
      ? activity.start_latlng
      : detail.start_latlng,
    map: activity.map?.summary_polyline
      ? activity.map
      : (detail.map ?? activity.map ?? null),
    trainer: activity.trainer ?? detail.trainer,
    manual: activity.manual ?? detail.manual,
  };
}

const label = (a: PlusStravaActivity) => `"${a.name ?? a.id}" (${a.id})`;

/**
 * Fetches and stores the GPS tracks of the given Strava activities whose saved
 * entries have none yet, newest first, within the per-sync budget. Never throws.
 */
export async function plusSyncStravaGpsTracks(
  userId: string,
  accessToken: string,
  activities: PlusStravaActivity[],
  detailedActivities: Record<string | number, unknown> = {},
  options: { budget?: number; delayMs?: number } = {}
): Promise<PlusStravaTrackSummary> {
  const summary: PlusStravaTrackSummary = {
    stored: 0,
    alreadyHadTrack: 0,
    noEntry: 0,
    noPoints: 0,
    failed: 0,
    skippedBudget: 0,
    skippedRateLimited: 0,
  };
  const budget = options.budget ?? STRAVA_STREAM_BUDGET_PER_SYNC;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;
  try {
    const candidates = (activities || [])
      .map((activity) =>
        withDetailHints(
          activity,
          detailedActivities[activity.id] as
            Partial<PlusStravaActivity> | undefined
        )
      )
      .filter(
        (activity) =>
          activity.id && activity.start_date && activityHasGpsTrack(activity)
      );
    if (candidates.length === 0) return summary;

    const states = await loadEntryTrackStates(
      userId,
      candidates.map((a) => String(a.id))
    );
    const pending: Array<{
      activity: PlusStravaActivity;
      state: EntryTrackState;
    }> = [];
    for (const activity of candidates) {
      const state = states.get(String(activity.id));
      if (!state) summary.noEntry += 1;
      else if (state.has_track) summary.alreadyHadTrack += 1;
      else pending.push({ activity, state });
    }
    pending.sort((a, b) =>
      String(b.activity.start_date).localeCompare(String(a.activity.start_date))
    );

    const skipped: string[] = [];
    let fetched = 0;
    let stopReason: 'budget' | 'rate_limit' | 'shutdown' | null = null;
    for (const [index, { activity, state }] of pending.entries()) {
      if (!stopReason && isShuttingDown()) stopReason = 'shutdown';
      if (!stopReason && fetched >= budget) stopReason = 'budget';
      if (stopReason) {
        if (stopReason === 'budget') summary.skippedBudget += 1;
        else summary.skippedRateLimited += 1;
        skipped.push(String(activity.id));
        continue;
      }
      if (index > 0 && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      fetched += 1;
      let streams: StravaStreamSet;
      try {
        const result = await fetchStreams(accessToken, activity.id);
        streams = result.streams;
        if (result.nearlyUsed) stopReason = 'rate_limit';
      } catch (error) {
        if (httpStatus(error) === 429) {
          stopReason = 'rate_limit';
          summary.skippedRateLimited += 1;
          skipped.push(String(activity.id));
          log(
            'warn',
            `[plusStravaStreams] Strava rate limit reached for user ${userId}; no more GPS tracks this sync.`
          );
        } else {
          summary.failed += 1;
          log(
            'warn',
            `[plusStravaStreams] Could not fetch the GPS track of ${label(activity)} for user ${userId}: ${describeError(error)}`
          );
        }
        continue;
      }
      const points = mapStravaStreamsToGpsPoints(
        streams,
        String(activity.start_date)
      );
      if (points.length === 0) {
        summary.noPoints += 1;
        log(
          'debug',
          `[plusStravaStreams] ${label(activity)} has no GPS points in its streams.`
        );
        continue;
      }
      try {
        await saveTrack(
          userId,
          points.map((p) => toFlatRow(p, userId, state.id, state.entry_date))
        );
        summary.stored += 1;
      } catch (error) {
        summary.failed += 1;
        log(
          'warn',
          `[plusStravaStreams] Could not store the GPS track of ${label(activity)} for user ${userId}: ${describeError(error)}`
        );
      }
    }

    if (skipped.length > 0) {
      log(
        'info',
        `[plusStravaStreams] Skipped GPS tracks for user ${userId} (${stopReason === 'budget' ? `per-sync budget of ${budget} reached` : stopReason === 'shutdown' ? 'server shutting down' : 'Strava rate limit'}); a later sync fetches them: ${skipped.join(', ')}`
      );
    }
    log(
      'info',
      `[plusStravaStreams] GPS tracks for user ${userId}: ${summary.stored} stored, ${summary.alreadyHadTrack} already present, ${summary.failed} failed, ${summary.skippedBudget + summary.skippedRateLimited} skipped.`
    );
  } catch (error) {
    log(
      'warn',
      `[plusStravaStreams] GPS track step failed for user ${userId}: ${describeError(error)}`
    );
  }
  return summary;
}
