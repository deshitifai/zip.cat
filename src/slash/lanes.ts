import type { CacheDescriptor, JsonSchema, SlashCommandArgument } from "../models";
import { HOUR_MS } from "../cache";
import { LanesSlashCommand, type SlashCommandContext } from "./base";

// The Canon Club's court-booking site (https://thecanonclub.com/court-booking) is
// powered by Clubspot, which runs on a Parse Server backend. Logging in is a two
// step flow:
//   1. resolve the Parse username from the member's email + club id via the
//      `retrieveUsersByEmailOrMobileNumber` cloud function, then
//   2. `POST /parse/login` with that username + password to get a session token.
// Reservations live in the `registrations` class; swim-lane bookings have a
// `merchObject` pointing at the "Swim Lanes" merch record. A session only sees the
// reservations that belong to the logged-in account, so no per-member filtering is
// needed.

const PARSE_APP_ID = "myclubspot2017";
const PARSE_SERVER_URL = "https://theclubspot.com/parse";
const CANON_CLUB_ID = "gxC6CgSXja";
const SWIM_LANES_MERCH_ID = "IuurJjDFkh";
const PARSE_CLIENT = {
  _ApplicationId: PARSE_APP_ID,
  _ClientVersion: "js1.11.1",
  _InstallationId: "00000000-0000-0000-0000-000000000000"
} as const;

const DAYS_AHEAD = 5;

type LanesArgs = Record<string, never>;

type ParseUser = {
  objectId: string;
  username: string;
};

type ParseDate = {
  __type: "Date";
  iso: string;
};

type Registration = {
  objectId: string;
  dateString?: string;
  startTime?: number;
  endTime?: number;
  startDate?: ParseDate;
  participantNames?: string[];
  courtObject?: { name?: string };
  status?: string;
};

type Club = {
  objectId: string;
  name?: string;
  timezone?: string;
};

type ReservableSubunit = {
  objectId: string;
  name?: string;
  subCourts?: ReservableSubunit[];
};

type Shift = {
  objectId: string;
  court_objects?: ReservableSubunit[];
};

type CourtAvailabilityOption = {
  start_time?: string | number;
  end_time?: string | number;
  duration?: number;
  available?: boolean;
  booked_by?: unknown[];
  held_by?: unknown[];
  time_blocks_array?: unknown[];
  club_date?: ParseDate;
};

type CourtAvailability = {
  courtId?: string;
  courtName?: string;
  options?: CourtAvailabilityOption[];
};

export type LaneReservation = {
  id: string;
  date: string;
  weekday: string;
  startTime: string;
  endTime: string;
  lane: string;
  who: string;
};

export type LaneOpening = {
  date: string;
  weekday: string;
  startTime: string;
  endTime: string;
  lanes: string[];
};

export type LaneDay = {
  date: string;
  weekday: string;
  reservations: LaneReservation[];
  availableOpenings: LaneOpening[];
};

export type LanesOutput = {
  club: string;
  windowDays: number;
  reservations: LaneReservation[];
  availableOpenings: LaneOpening[];
  days: LaneDay[];
  source: {
    name: "Clubspot";
    bookingUrl: string;
  };
};

const laneReservationSchema = {
  type: "object",
  required: ["id", "date", "weekday", "startTime", "endTime", "lane", "who"],
  properties: {
    id: { type: "string" },
    date: { type: "string" },
    weekday: { type: "string" },
    startTime: { type: "string" },
    endTime: { type: "string" },
    lane: { type: "string" },
    who: { type: "string" }
  }
} satisfies JsonSchema;

const laneOpeningSchema = {
  type: "object",
  required: ["date", "weekday", "startTime", "endTime", "lanes"],
  properties: {
    date: { type: "string" },
    weekday: { type: "string" },
    startTime: { type: "string" },
    endTime: { type: "string" },
    lanes: {
      type: "array",
      items: { type: "string" }
    }
  }
} satisfies JsonSchema;

export const lanesOutputSchema = {
  type: "object",
  required: ["club", "windowDays", "reservations", "availableOpenings", "days", "source"],
  properties: {
    club: { type: "string" },
    windowDays: { type: "number" },
    reservations: {
      type: "array",
      items: laneReservationSchema
    },
    availableOpenings: {
      type: "array",
      items: laneOpeningSchema
    },
    days: {
      type: "array",
      items: {
        type: "object",
        required: ["date", "weekday", "reservations", "availableOpenings"],
        properties: {
          date: { type: "string" },
          weekday: { type: "string" },
          reservations: {
            type: "array",
            items: laneReservationSchema
          },
          availableOpenings: {
            type: "array",
            items: laneOpeningSchema
          }
        }
      }
    },
    source: {
      type: "object",
      required: ["name", "bookingUrl"],
      properties: {
        name: { type: "string", const: "Clubspot" },
        bookingUrl: { type: "string", format: "uri" }
      }
    }
  }
} satisfies JsonSchema;

function credentials() {
  const email = process.env.CANON_POOL_LOGIN?.trim().toLowerCase();
  const password = process.env.CANON_POOL_PASSWORD?.trim();
  if (!email || !password) {
    throw new Error("/lanes needs CANON_POOL_LOGIN and CANON_POOL_PASSWORD in the server environment.");
  }
  return { email, password };
}

async function parseGet<T>(path: string, params: URLSearchParams, sessionToken: string, label: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${PARSE_SERVER_URL}${path}?${params}`, {
      headers: {
        "X-Parse-Application-Id": PARSE_APP_ID,
        "X-Parse-Session-Token": sessionToken
      },
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(`${label} timed out.`);
    }
    throw error;
  }

  const body = await response.json() as T & { error?: string; code?: number };
  if (!response.ok || body.error) {
    throw new Error(body.error ? `${label}: ${body.error}` : `${label} failed with ${response.status}.`);
  }
  return body;
}

async function parsePost<T>(path: string, payload: Record<string, unknown>, label: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${PARSE_SERVER_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ ...payload, ...PARSE_CLIENT }),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(`${label} timed out.`);
    }
    throw error;
  }

  const body = await response.json() as T & { error?: string; code?: number };
  if (!response.ok || body.error) {
    throw new Error(body.error ? `${label}: ${body.error}` : `${label} failed with ${response.status}.`);
  }
  return body;
}

async function resolveUsername(email: string): Promise<ParseUser> {
  const body = await parsePost<{ result?: ParseUser[] }>(
    "/functions/retrieveUsersByEmailOrMobileNumber",
    { email, clubID: CANON_CLUB_ID, _method: "POST" },
    "Canon Club account lookup"
  );
  const user = body.result?.[0];
  if (!user?.username) {
    throw new Error(`No Canon Club account found for ${email}.`);
  }
  return user;
}

async function logIn(username: string, password: string): Promise<string> {
  const body = await parsePost<{ sessionToken?: string }>(
    "/login",
    { username, password, _method: "GET" },
    "Canon Club login"
  );
  if (!body.sessionToken) {
    throw new Error("Canon Club login did not return a session.");
  }
  return body.sessionToken;
}

async function fetchSwimLaneReservations(sessionToken: string): Promise<Registration[]> {
  const now = new Date();
  const end = new Date(now.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);
  const where = {
    clubObject: { __type: "Pointer", className: "clubs", objectId: CANON_CLUB_ID },
    merchObject: { __type: "Pointer", className: "merch", objectId: SWIM_LANES_MERCH_ID },
    archived: false,
    status: "confirmed",
    startDate: {
      $gte: { __type: "Date", iso: now.toISOString() },
      $lt: { __type: "Date", iso: end.toISOString() }
    }
  };
  const params = new URLSearchParams({
    where: JSON.stringify(where),
    include: "courtObject",
    order: "startDate,startTime",
    limit: "200"
  });

  let response: Response;
  try {
    response = await fetch(`${PARSE_SERVER_URL}/classes/registrations?${params}`, {
      headers: {
        "X-Parse-Application-Id": PARSE_APP_ID,
        "X-Parse-Session-Token": sessionToken
      },
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("Canon Club reservation lookup timed out.");
    }
    throw error;
  }

  const body = await response.json() as { results?: Registration[]; error?: string };
  if (!response.ok || body.error) {
    throw new Error(body.error ? `Canon Club reservations: ${body.error}` : `Reservation lookup failed with ${response.status}.`);
  }
  return body.results ?? [];
}

async function fetchClub(sessionToken: string): Promise<Club> {
  return await parseGet<Club>(
    `/classes/clubs/${CANON_CLUB_ID}`,
    new URLSearchParams(),
    sessionToken,
    "Canon Club lookup"
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type CalendarDay = {
  year: number;
  month: number;
  date: number;
};

function zonedParts(value: Date, timezone: string): CalendarDay & { hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false
  }).formatToParts(value);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return {
    year: part("year"),
    month: part("month") - 1,
    date: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second")
  };
}

function utcForZonedMidnight(day: CalendarDay, timezone: string) {
  const utcGuess = new Date(Date.UTC(day.year, day.month, day.date));
  const rendered = zonedParts(utcGuess, timezone);
  const renderedAsUtc = Date.UTC(rendered.year, rendered.month, rendered.date, rendered.hour, rendered.minute, rendered.second);
  return new Date(utcGuess.getTime() - (renderedAsUtc - utcGuess.getTime()));
}

function addCalendarDays(day: CalendarDay, offset: number): CalendarDay {
  const date = new Date(Date.UTC(day.year, day.month, day.date + offset));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    date: date.getUTCDate()
  };
}

function dateStringForDay(day: CalendarDay) {
  return `${MONTHS[day.month]}-${day.date}-${day.year}`;
}

function weekdayForDay(day: CalendarDay) {
  return WEEKDAYS[new Date(Date.UTC(day.year, day.month, day.date)).getUTCDay()] ?? "";
}

function dayOfWeek(day: CalendarDay) {
  return new Date(Date.UTC(day.year, day.month, day.date)).getUTCDay();
}

function militaryToClock(value: number | undefined): string {
  return militaryValueToClock(value);
}

function militaryValueToClock(value: number | string | undefined): string {
  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return "--";
    }
    return militaryValueToClock(parsed);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  const hours24 = Math.floor(value / 100);
  const minutes = value % 100;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function militarySortValue(value: number | string | undefined) {
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function weekdayFor(reservation: Registration): string {
  const iso = reservation.startDate?.iso;
  if (iso) {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) {
      return WEEKDAYS[parsed.getUTCDay()] ?? "";
    }
  }
  return "";
}

function toLaneReservation(reservation: Registration): LaneReservation {
  const who = (reservation.participantNames ?? []).filter(Boolean).join(", ");
  return {
    id: reservation.objectId,
    date: reservation.dateString ?? "",
    weekday: weekdayFor(reservation),
    startTime: militaryToClock(reservation.startTime),
    endTime: militaryToClock(reservation.endTime),
    lane: reservation.courtObject?.name ?? "Lane",
    who: who || "You"
  };
}

async function fetchSwimLaneShifts(sessionToken: string, day: CalendarDay, timezone: string): Promise<Shift[]> {
  const midnightUTC = utcForZonedMidnight(day, timezone);
  const where = {
    clubObject: { __type: "Pointer", className: "clubs", objectId: CANON_CLUB_ID },
    merchObject: { __type: "Pointer", className: "merch", objectId: SWIM_LANES_MERCH_ID },
    archived: false,
    type: "court",
    available_days: dayOfWeek(day),
    endDate: {
      $gte: { __type: "Date", iso: midnightUTC.toISOString() }
    },
    startDate: {
      $lte: { __type: "Date", iso: midnightUTC.toISOString() }
    }
  };
  const params = new URLSearchParams({
    where: JSON.stringify(where),
    include: "merchObject,court_objects",
    order: "start_time",
    limit: "50"
  });
  const body = await parseGet<{ results?: Shift[] }>(
    "/classes/shifts",
    params,
    sessionToken,
    "Canon Club swim-lane schedule lookup"
  );
  return body.results ?? [];
}

function courtIdsForShifts(shifts: Shift[]) {
  const ids = new Set<string>();
  shifts.forEach((shift) => {
    (shift.court_objects ?? []).forEach((court) => {
      if (court.objectId) {
        ids.add(court.objectId);
      }
      (court.subCourts ?? []).forEach((subCourt) => {
        if (subCourt.objectId) {
          ids.add(subCourt.objectId);
        }
      });
    });
  });
  return [...ids];
}

async function fetchSwimLaneAvailability(sessionToken: string, day: CalendarDay, timezone: string): Promise<CourtAvailability[]> {
  const shifts = await fetchSwimLaneShifts(sessionToken, day, timezone);
  const courtIds = courtIdsForShifts(shifts);
  if (courtIds.length === 0) {
    return [];
  }
  const body = await parsePost<{ result?: CourtAvailability[] }>(
    "/functions/retrieve_court_availability",
    {
      day: dayOfWeek(day),
      date_string: dateStringForDay(day),
      club_id: CANON_CLUB_ID,
      court_ids: courtIds,
      court_type_ids: [SWIM_LANES_MERCH_ID],
      include_billing: true,
      flow: "member"
    },
    "Canon Club swim-lane availability"
  );
  return body.result ?? [];
}

function isFutureOpening(option: CourtAvailabilityOption) {
  const startIso = option.club_date?.iso;
  if (!startIso) {
    return true;
  }
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) {
    return true;
  }
  const end = new Date(start.getTime() + (option.duration ?? 0) * 60 * 1000);
  return end >= new Date();
}

function isOpenOption(option: CourtAvailabilityOption) {
  return Boolean(option.available) &&
    (option.booked_by?.length ?? 0) === 0 &&
    (option.held_by?.length ?? 0) === 0 &&
    (option.time_blocks_array?.length ?? 0) === 0 &&
    isFutureOpening(option);
}

function openingsForAvailability(day: CalendarDay, availability: CourtAvailability[]): LaneOpening[] {
  const grouped = new Map<string, LaneOpening & { sortStart: number }>();
  availability.forEach((court) => {
    (court.options ?? []).forEach((option) => {
      if (!isOpenOption(option)) {
        return;
      }
      const startTime = militaryValueToClock(option.start_time);
      const endTime = militaryValueToClock(option.end_time);
      if (startTime === "--" || endTime === "--") {
        return;
      }
      const key = `${startTime}|${endTime}`;
      const existing = grouped.get(key) ?? {
        date: dateStringForDay(day),
        weekday: weekdayForDay(day),
        startTime,
        endTime,
        lanes: [],
        sortStart: militarySortValue(option.start_time)
      };
      existing.lanes.push(court.courtName ?? "Lane");
      grouped.set(key, existing);
    });
  });
  return [...grouped.values()]
    .sort((a, b) => a.sortStart - b.sortStart)
    .map(({ sortStart: _sortStart, ...opening }) => opening);
}

function daysForWindow(timezone: string) {
  const today = zonedParts(new Date(), timezone);
  return Array.from({ length: DAYS_AHEAD }, (_, index) => addCalendarDays(today, index));
}

async function buildLaneDays(
  sessionToken: string,
  timezone: string,
  reservations: LaneReservation[]
): Promise<LaneDay[]> {
  return await Promise.all(daysForWindow(timezone).map(async (day) => {
    const date = dateStringForDay(day);
    const dayReservations = reservations.filter((reservation) => reservation.date === date);
    const availableOpenings = dayReservations.length === 0
      ? openingsForAvailability(day, await fetchSwimLaneAvailability(sessionToken, day, timezone))
      : [];
    return {
      date,
      weekday: weekdayForDay(day),
      reservations: dayReservations,
      availableOpenings
    };
  }));
}

export class CanonClubLanesCommand extends LanesSlashCommand<LanesArgs, LanesOutput> {
  readonly id = "slash.lanes.canon-club";
  readonly name = "Swim Lanes";
  readonly command = "/lanes";
  readonly description = "Your next 5 days of Canon Club swim-lane reservations.";
  readonly arguments: SlashCommandArgument[] = [];
  readonly outputSchema = lanesOutputSchema;
  readonly cache: CacheDescriptor = { ttlMs: 4 * HOUR_MS };

  enabled() {
    // Server-only: it needs the CANON_POOL_* secrets and same-origin-free network
    // access to Clubspot, neither of which exist in the static/browser build.
    return typeof process !== "undefined" && Boolean(process.env);
  }

  parseArguments(): LanesArgs {
    return {} as LanesArgs;
  }

  async executeCommand(): Promise<LanesOutput> {
    const { email, password } = credentials();
    const user = await resolveUsername(email);
    const sessionToken = await logIn(user.username, password);
    const [club, reservations] = await Promise.all([
      fetchClub(sessionToken),
      fetchSwimLaneReservations(sessionToken)
    ]);
    const laneReservations = reservations.map(toLaneReservation);
    const days = await buildLaneDays(sessionToken, club.timezone ?? "America/Los_Angeles", laneReservations);
    const availableOpenings = days.flatMap((day) => day.availableOpenings);

    return {
      club: club.name ?? "The Canon Club",
      windowDays: DAYS_AHEAD,
      reservations: laneReservations,
      availableOpenings,
      days,
      source: {
        name: "Clubspot",
        bookingUrl: "https://thecanonclub.com/court-booking"
      }
    };
  }
}

export function lanesSlashCommand() {
  return new CanonClubLanesCommand();
}
