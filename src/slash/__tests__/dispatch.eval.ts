// Eval library for the implicit dispatcher + install-config resolution.
import { detectImplicitCommand, completeImplicitInput } from "../registry";
import { resolveInstallConfig, DEFAULT_INSTALL_CONFIG } from "../install";
import { CalcCommand } from "../calc";
import type { Suite } from "./harness";

export const dispatchSuite: Suite = {
  name: "implicit dispatch (best command wins)",
  run(report) {
    // Math formula → calc.
    const calc = detectImplicitCommand("5 + 7");
    if (calc?.commandId !== "slash.calc") {
      report.fail('detectImplicit("5 + 7") → calc', calc?.commandId);
    } else {
      report.ok("formula → calc");
    }

    // Conversion phrase → convert.
    const conv = detectImplicitCommand("1 cup in qt");
    if (conv?.commandId !== "slash.convert") {
      report.fail('detectImplicit("1 cup in qt") → convert', conv?.commandId);
    } else {
      report.ok("phrase → convert");
    }

    // Bare uppercase ticker → stock.
    const stock = detectImplicitCommand("MSFT");
    if (stock?.commandId !== "slash.stock") {
      report.fail('detectImplicit("MSFT") → stock', stock?.commandId);
    } else {
      report.ok("ticker → stock");
    }

    // Ticker-looking first words inside phrases remain normal search text.
    const stockPhrase = detectImplicitCommand("MSFT stock");
    if (stockPhrase?.commandId === "slash.stock") {
      report.fail('"MSFT stock" should not implicit-match stock');
    } else {
      report.ok("ticker phrase not stock");
    }

    // Explicit slash → no implicit.
    if (detectImplicitCommand("/calc 2+2")) {
      report.fail("slash input should not implicit-match");
    } else {
      report.ok("slash declines implicit");
    }

    // Empty → nothing.
    if (detectImplicitCommand("   ")) {
      report.fail("empty should not match");
    } else {
      report.ok("empty declines");
    }

    // Stopword "in" must not be read as a ticker.
    const inWord = detectImplicitCommand("in");
    if (inWord?.commandId === "slash.stock") {
      report.fail('"in" should not be a ticker');
    } else {
      report.ok("stopword not ticker");
    }

    // Ticker-shaped words that aren't listed symbols stay normal searches.
    for (const word of ["hello", "zzzzz", "QXJW"]) {
      const match = detectImplicitCommand(word);
      if (match?.commandId === "slash.stock") {
        report.fail(`"${word}" is not a known ticker and should not match stock`);
      } else {
        report.ok(`unknown symbol "${word}" not ticker`);
      }
    }

    // Uppercase form of a word-colliding ticker is a deliberate signal.
    const catUpper = detectImplicitCommand("CAT");
    if (catUpper?.commandId !== "slash.stock") {
      report.fail('detectImplicit("CAT") → stock', catUpper?.commandId);
    } else {
      report.ok("uppercase CAT → stock");
    }

    // ...but the lowercase common word stays a search.
    const catLower = detectImplicitCommand("cat");
    if (catLower?.commandId === "slash.stock") {
      report.fail('"cat" should not be a ticker');
    } else {
      report.ok("lowercase cat not ticker");
    }

    // Dot-suffixed share classes are known tickers too.
    const brk = detectImplicitCommand("BRK.B");
    if (brk?.commandId !== "slash.stock") {
      report.fail('detectImplicit("BRK.B") → stock', brk?.commandId);
    } else {
      report.ok("BRK.B → stock");
    }
  }
};

export const dispatchCompleteSuite: Suite = {
  name: "implicit autocomplete dispatch",
  run(report) {
    const completed = completeImplicitInput("50 fah");
    if (completed !== "50 fahrenheit in celsius") {
      report.fail('completeImplicitInput("50 fah")', completed);
    } else {
      report.ok("convert completion routed");
    }
    // The headline trailing-space example routes through the dispatcher too.
    const trailing = completeImplicitInput("12 in ");
    if (trailing !== "12 in in ft") {
      report.fail('completeImplicitInput("12 in ")', trailing);
    } else {
      report.ok("trailing-space completion routed");
    }
    // The completed string always extends the input (so the client can show the
    // remainder as a ghost suffix). Verify the suffix relationship holds.
    if (!trailing || !trailing.startsWith("12 in ")) {
      report.fail("completion must extend the typed input", trailing);
    } else {
      report.ok("completion extends input (ghost suffix valid)");
    }
    // Slash input is never completed implicitly.
    if (completeImplicitInput("/convert 50 fah") !== undefined) {
      report.fail("slash input should not autocomplete implicitly");
    } else {
      report.ok("slash declines completion");
    }
  }
};

export const installConfigSuite: Suite = {
  name: "install-config resolution + overrides",
  run(report) {
    const calc = new CalcCommand();

    // Default: calc implicit is enabled, inline-live.
    const base = resolveInstallConfig(calc.id, calc.installDefaults);
    if (!base.implicit.enabled || base.implicit.render !== "inline-live") {
      report.fail("calc default implicit", base.implicit);
    } else {
      report.ok("calc default = inline-live");
    }

    // Runtime override can disable implicit pickup.
    const disabled = resolveInstallConfig(calc.id, calc.installDefaults, {
      [calc.id]: { implicit: { enabled: false } }
    });
    if (disabled.implicit.enabled) {
      report.fail("override should disable implicit", disabled.implicit);
    } else {
      report.ok("override disables implicit");
    }

    // Disabling implicit via override must remove calc from dispatch.
    const stillMatches = detectImplicitCommand("5 + 7", {
      [calc.id]: { implicit: { enabled: false } }
    });
    if (stillMatches?.commandId === "slash.calc") {
      report.fail("disabled calc should not win dispatch");
    } else {
      report.ok("disabled calc drops out of dispatch");
    }

    // Raising minConfidence above a match's confidence filters it out.
    const strict = detectImplicitCommand("msft", {
      "slash.stock": { implicit: { minConfidence: 0.99 } }
    });
    if (strict?.commandId === "slash.stock") {
      report.fail("strict minConfidence should filter weak ticker");
    } else {
      report.ok("minConfidence gate works");
    }

    // Unknown keys fall back to defaults cleanly.
    const fallback = resolveInstallConfig("slash.nonexistent", DEFAULT_INSTALL_CONFIG);
    if (fallback.enabled !== true) {
      report.fail("default fallback", fallback);
    } else {
      report.ok("default fallback ok");
    }
  }
};

export const dispatchSuites: Suite[] = [dispatchSuite, dispatchCompleteSuite, installConfigSuite];
