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

export type LaneReservation = {
  id: string;
  date: string;
  weekday: string;
  startTime: string;
  endTime: string;
  lane: string;
  who: string;
};

export type LanesOutput = {
  club: string;
  windowDays: number;
  reservations: LaneReservation[];
  source: {
    name: "Clubspot";
    bookingUrl: string;
  };
};

export const lanesOutputSchema = {
  type: "object",
  required: ["club", "windowDays", "reservations", "source"],
  properties: {
    club: { type: "string" },
    windowDays: { type: "number" },
    reservations: {
      type: "array",
      items: {
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function militaryToClock(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "--";
  }
  const hours24 = Math.floor(value / 100);
  const minutes = value % 100;
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`;
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
    const reservations = await fetchSwimLaneReservations(sessionToken);

    return {
      club: "The Canon Club",
      windowDays: DAYS_AHEAD,
      reservations: reservations.map(toLaneReservation),
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
