import type { JsonSchema, SlashCommandArgument } from "../models";
import { LookupSlashCommand, type SlashCommandContext } from "./base";

type PasswordArgs = {
  mode: "chars" | "words";
  length: number;
};

export type PasswordOutput = {
  password: string;
  mode: "chars" | "words";
  length: number;
  entropyBits: number;
  strength: "weak" | "fair" | "strong" | "excellent";
};

export const passwordOutputSchema = {
  type: "object",
  required: ["password", "mode", "length", "entropyBits", "strength"],
  properties: {
    password: { type: "string" },
    mode: { type: "string" },
    length: { type: "number" },
    entropyBits: { type: "number" },
    strength: { type: "string" }
  }
} satisfies JsonSchema;

// Character alphabet for `chars` mode. Excludes visually ambiguous glyphs
// (0/O, 1/l/I) so generated passwords transcribe reliably.
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+";

// A compact, curated wordlist for passphrase mode (all lowercase, 3–6 letters).
// ~256 entries → 8 bits of entropy per word, easy to reason about.
const WORDLIST = [
  "able", "acid", "aged", "also", "area", "army", "atom", "aunt", "away", "baby",
  "back", "ball", "band", "bank", "barn", "base", "bath", "bead", "beam", "bean",
  "bear", "beat", "bell", "belt", "bend", "best", "bike", "bird", "bite", "blue",
  "boat", "body", "bold", "bolt", "bone", "book", "boot", "born", "boss", "both",
  "bowl", "brave", "bread", "brick", "bring", "brown", "brush", "build", "burn", "bush",
  "cake", "calm", "camp", "card", "care", "cart", "case", "cash", "cast", "cave",
  "cell", "chair", "chalk", "charm", "chase", "cheer", "chess", "chief", "city", "clay",
  "clean", "clear", "climb", "clock", "cloth", "cloud", "coal", "coast", "coat", "code",
  "coin", "cold", "comb", "cone", "cook", "cool", "copy", "cord", "core", "corn",
  "cost", "crab", "craft", "crane", "crash", "cream", "crew", "crisp", "crop", "crowd",
  "crown", "cube", "curl", "dance", "dark", "dash", "data", "dawn", "deal", "deck",
  "deep", "deer", "dent", "desk", "dial", "dice", "diet", "dish", "dive", "dock",
  "does", "dome", "door", "dose", "dot", "dove", "drag", "draw", "dream", "dress",
  "drift", "drink", "drive", "drop", "drum", "dry", "duck", "dune", "dusk", "dust",
  "each", "earn", "ease", "east", "easy", "echo", "edge", "elf", "envy", "epic",
  "even", "exit", "face", "fact", "fade", "fair", "fall", "fame", "farm", "fast",
  "fate", "fear", "feast", "fence", "fern", "few", "field", "fig", "file", "fill",
  "film", "find", "fine", "fire", "fish", "fist", "five", "flag", "flame", "flash",
  "flat", "flee", "flint", "float", "flock", "flood", "floor", "flour", "flow", "flute",
  "foam", "fog", "fold", "folk", "font", "food", "fool", "foot", "ford", "fork",
  "form", "fort", "four", "fox", "frame", "free", "fresh", "frog", "front", "frost",
  "fruit", "fuel", "full", "fun", "fund", "fur", "gain", "game", "gate", "gaze",
  "gear", "gem", "gift", "girl", "give", "glad", "glass", "glide", "globe", "glow",
  "goal", "goat", "gold", "golf", "good", "grab", "grain", "grand", "grape", "grass",
  "gray", "graze", "great", "green", "grid", "grin", "grip", "grow", "gulf", "gust",
  "hail", "hair", "half", "hall", "hand"
];

function randomUint32(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0]!;
}

// Rejection sampling for a uniform integer in [0, max) — no modulo bias.
function randomBelow(max: number): number {
  if (max <= 0) {
    throw new Error("max must be positive.");
  }
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  let value = randomUint32();
  while (value >= limit) {
    value = randomUint32();
  }
  return value % max;
}

function generateChars(length: number): string {
  let password = "";
  for (let index = 0; index < length; index += 1) {
    password += ALPHABET[randomBelow(ALPHABET.length)];
  }
  return password;
}

function generateWords(count: number): string {
  const words: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const word = WORDLIST[randomBelow(WORDLIST.length)]!;
    words.push(word);
  }
  // Capitalise one random word and append two digits for site-policy compatibility.
  const capitalIndex = randomBelow(words.length);
  words[capitalIndex] = words[capitalIndex]!.charAt(0).toUpperCase() + words[capitalIndex]!.slice(1);
  const digits = String(randomBelow(100)).padStart(2, "0");
  return `${words.join("-")}-${digits}`;
}

function strengthFor(entropyBits: number): PasswordOutput["strength"] {
  if (entropyBits < 50) return "weak";
  if (entropyBits < 70) return "fair";
  if (entropyBits < 100) return "strong";
  return "excellent";
}

export class PasswordCommand extends LookupSlashCommand<PasswordArgs, PasswordOutput> {
  readonly id = "slash.password";
  readonly name = "Password";
  readonly command = "/password";
  readonly description = "Generate a cryptographically random password (chars) or passphrase (words).";
  readonly arguments: SlashCommandArgument[] = [
    {
      name: "mode",
      label: "mode",
      type: "choice",
      required: false,
      choices: [
        { label: "characters", value: "chars" },
        { label: "words", value: "words" }
      ]
    },
    { name: "length", label: "length", type: "number", required: false, placeholder: "20", widthChars: 5 }
  ];
  readonly outputSchema = passwordOutputSchema;
  // Never cached — every invocation must produce fresh randomness.

  protected readonly triggerPatterns = [/^\/(password|passphrase|pw|pass)\b/i];

  parseArguments(context: SlashCommandContext): PasswordArgs {
    const inline = context.request.query.replace(/^\/(password|passphrase|pw|pass)\b/i, "").trim();
    const inlineTokens = inline.split(/\s+/).filter(Boolean);

    const wantsWords =
      /passphrase/i.test(context.request.query) ||
      String(this.argumentValue(context, "mode") ?? "").toLowerCase() === "words" ||
      inlineTokens.some((token) => /^words?$/i.test(token));

    const mode: PasswordArgs["mode"] = wantsWords ? "words" : "chars";

    const explicitLength = this.argumentValue(context, "length");
    const inlineLength = inlineTokens.map(Number).find((value) => Number.isFinite(value) && value > 0);
    const rawLength = Number(explicitLength ?? inlineLength ?? (mode === "words" ? 5 : 20));

    const bounds = mode === "words" ? { min: 3, max: 12 } : { min: 8, max: 128 };
    const length = Math.min(Math.max(Math.round(rawLength) || bounds.min, bounds.min), bounds.max);

    return { mode, length };
  }

  executeCommand(args: PasswordArgs): PasswordOutput {
    if (args.mode === "words") {
      const password = generateWords(args.length);
      // log2(wordlist) per word + log2(100) for the digits + 1 bit for the capital position.
      const entropyBits = Math.round(
        args.length * Math.log2(WORDLIST.length) + Math.log2(100) + Math.log2(args.length)
      );
      return {
        password,
        mode: "words",
        length: args.length,
        entropyBits,
        strength: strengthFor(entropyBits)
      };
    }

    const password = generateChars(args.length);
    const entropyBits = Math.round(args.length * Math.log2(ALPHABET.length));
    return {
      password,
      mode: "chars",
      length: args.length,
      entropyBits,
      strength: strengthFor(entropyBits)
    };
  }
}

export function passwordSlashCommand() {
  return new PasswordCommand();
}
