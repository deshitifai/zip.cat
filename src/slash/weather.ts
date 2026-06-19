import type { JsonSchema, SlashCommandArgument } from "../models";
import { WeatherSlashCommand, type SlashCommandContext } from "./base";

type WeatherArgs = {
  zipcode: string;
};

type OpenMeteoLocation = {
  name?: string;
  latitude?: number;
  longitude?: number;
  country?: string;
  admin1?: string;
  timezone?: string;
  postcodes?: string[];
};

type GeocodingResponse = {
  results?: OpenMeteoLocation[];
  error?: boolean;
  reason?: string;
};

type ForecastResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    apparent_temperature?: number;
    is_day?: number;
    precipitation?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
  error?: boolean;
  reason?: string;
};

export type WeatherOutput = {
  location: {
    name: string;
    region?: string;
    country?: string;
    timezone?: string;
    latitude: number;
    longitude: number;
  };
  current: {
    time?: string;
    summary: string;
    temperatureF?: number;
    feelsLikeF?: number;
    humidityPercent?: number;
    precipitationInches?: number;
    windMph?: number;
    isDay?: boolean;
  };
  daily: Array<{
    date: string;
    summary: string;
    highF?: number;
    lowF?: number;
    precipitationChancePercent?: number;
  }>;
  source: {
    name: "Open-Meteo";
    geocodingUrl: string;
    forecastUrl: string;
  };
};

export const weatherOutputSchema = {
  type: "object",
  required: ["location", "current", "daily", "source"],
  properties: {
    location: {
      type: "object",
      required: ["name", "latitude", "longitude"],
      properties: {
        name: { type: "string" },
        region: { type: "string" },
        country: { type: "string" },
        timezone: { type: "string" },
        latitude: { type: "number" },
        longitude: { type: "number" }
      }
    },
    current: {
      type: "object",
      required: ["summary"],
      properties: {
        time: { type: "string" },
        summary: { type: "string" },
        temperatureF: { type: "number" },
        feelsLikeF: { type: "number" },
        humidityPercent: { type: "number" },
        precipitationInches: { type: "number" },
        windMph: { type: "number" },
        isDay: { type: "boolean" }
      }
    },
    daily: {
      type: "array",
      items: {
        type: "object",
        required: ["date", "summary"],
        properties: {
          date: { type: "string" },
          summary: { type: "string" },
          highF: { type: "number" },
          lowF: { type: "number" },
          precipitationChancePercent: { type: "number" }
        }
      }
    },
    source: {
      type: "object",
      required: ["name", "geocodingUrl", "forecastUrl"],
      properties: {
        name: { type: "string", const: "Open-Meteo" },
        geocodingUrl: { type: "string", format: "uri" },
        forecastUrl: { type: "string", format: "uri" }
      }
    }
  }
} satisfies JsonSchema;

const weatherCodeDescriptions: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Light freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Light snow showers",
  86: "Snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail"
};

function weatherSummary(code: number | undefined) {
  return typeof code === "number" ? weatherCodeDescriptions[code] ?? `Weather code ${code}` : "Unknown";
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function bestLocation(locations: OpenMeteoLocation[] | undefined) {
  return locations?.find((location) => (
    typeof location.latitude === "number" &&
    typeof location.longitude === "number" &&
    Boolean(location.name)
  ));
}

async function fetchOpenMeteoJson<T>(url: string, label: string) {
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "zip.cat/0.1"
      },
      signal: AbortSignal.timeout(6000)
    });
    const payload = await response.json() as T & {
      error?: boolean;
      reason?: string;
    };

    if (!response.ok || payload.error) {
      throw new Error(payload.reason ?? `${label} failed with ${response.status}.`);
    }

    return payload;
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(`${label} timed out.`);
    }
    throw error;
  }
}

export class OpenMeteoWeatherCommand extends WeatherSlashCommand<WeatherArgs, WeatherOutput> {
  readonly id = "slash.weather.open-meteo";
  readonly name = "Weather";
  readonly command = "/weather";
  readonly description = "Current weather and short forecast for a ZIP or postal code.";
  readonly arguments: SlashCommandArgument[] = [{
    name: "zipcode",
    label: "zipcode",
    type: "text",
    required: true,
    placeholder: "zipcode",
    widthChars: 5
  }];
  readonly outputSchema = weatherOutputSchema;

  parseArguments(context: SlashCommandContext): WeatherArgs {
    const explicit = this.argumentValue(context, "zipcode");
    const inline = context.request.query.replace(/^\/weather\b/i, "").trim();
    const zipcode = String(explicit || inline).trim();

    if (!zipcode) {
      throw new Error("/weather requires a zipcode.");
    }

    return { zipcode };
  }

  async executeCommand(args: WeatherArgs): Promise<WeatherOutput> {
    const geocodingParams = new URLSearchParams({
      name: args.zipcode,
      count: "1",
      language: "en",
      format: "json"
    });
    if (/^\d{5}(?:-\d{4})?$/.test(args.zipcode)) {
      geocodingParams.set("countryCode", "US");
    }

    const geocodingUrl = `https://geocoding-api.open-meteo.com/v1/search?${geocodingParams}`;
    const geocoding = await fetchOpenMeteoJson<GeocodingResponse>(geocodingUrl, "Weather location lookup");

    const location = bestLocation(geocoding.results);
    if (!location || typeof location.latitude !== "number" || typeof location.longitude !== "number") {
      throw new Error(`No weather location found for ${args.zipcode}.`);
    }

    const forecastParams = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "is_day",
        "precipitation",
        "weather_code",
        "wind_speed_10m"
      ].join(","),
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_probability_max"
      ].join(","),
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      precipitation_unit: "inch",
      forecast_days: "5",
      timezone: "auto"
    });
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?${forecastParams}`;
    const forecast = await fetchOpenMeteoJson<ForecastResponse>(forecastUrl, "Weather forecast");

    const dailyTimes = forecast.daily?.time ?? [];
    const dailyCodes = forecast.daily?.weather_code ?? [];
    const dailyHighs = forecast.daily?.temperature_2m_max ?? [];
    const dailyLows = forecast.daily?.temperature_2m_min ?? [];
    const dailyPrecip = forecast.daily?.precipitation_probability_max ?? [];

    return {
      location: {
        name: location.name ?? args.zipcode,
        region: location.admin1,
        country: location.country,
        timezone: location.timezone,
        latitude: location.latitude,
        longitude: location.longitude
      },
      current: {
        time: forecast.current?.time,
        summary: weatherSummary(forecast.current?.weather_code),
        temperatureF: numeric(forecast.current?.temperature_2m),
        feelsLikeF: numeric(forecast.current?.apparent_temperature),
        humidityPercent: numeric(forecast.current?.relative_humidity_2m),
        precipitationInches: numeric(forecast.current?.precipitation),
        windMph: numeric(forecast.current?.wind_speed_10m),
        isDay: typeof forecast.current?.is_day === "number" ? forecast.current.is_day === 1 : undefined
      },
      daily: dailyTimes.map((date, index) => ({
        date,
        summary: weatherSummary(dailyCodes[index]),
        highF: numeric(dailyHighs[index]),
        lowF: numeric(dailyLows[index]),
        precipitationChancePercent: numeric(dailyPrecip[index])
      })),
      source: {
        name: "Open-Meteo",
        geocodingUrl,
        forecastUrl
      }
    };
  }
}

export function weatherSlashCommand() {
  return new OpenMeteoWeatherCommand();
}
