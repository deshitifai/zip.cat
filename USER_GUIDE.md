# zip.cat User Guide

zip.cat works like a small terminal for search and AI. The prompt at the bottom
is always the next command.

![Empty zip.cat terminal](docs/images/empty-terminal.jpg)

## Prompt Modes

There are two modes:

- `>` searches the web.
- `*` asks AI.

Use `Left Arrow` at the start of the command line or `Right Arrow` at the end of
the command line to toggle between `>` and `*`.

![AI mode prompt](docs/images/ai-mode.jpg)

When you submit a command, the next prompt stays in the same mode. If you submit
from `*`, the next prompt is still `*`. If you submit from `>`, the next prompt
is still `>`.

## Web Search

Type a query at `>` and press `Enter`.

![Search results](docs/images/search-results.jpg)

Each search becomes a bordered block. The command line inside that block remains
editable, so you can go back, change the query, and rerun it.

## AI Prompts

Switch to `*`, type a prompt, and press `Enter`.

AI responses render Markdown, including:

- headings
- lists
- links
- code blocks
- tables

If the AI response contains a link, Option shortcuts work on those links just
like they do for search results.

## Sidebar Suggestions

While typing a search command, zip.cat shows sidebar suggestions from:

- Wikipedia
- Wiktionary

Wiktionary suggestions include a short definition. Hover the Wiktionary box to
expand it in place and see the full definition.

## Opening Items Quickly

Hold `Option` to reveal shortcut labels.

The shortcut sequence is shared across the active context:

1. Search results first.
2. Sidebar suggestions after search results.
3. AI response links when an AI result is active.

Press the shown number or letter while still holding `Option` to open that item
in a new tab.

The shortcut labels use:

```text
1 2 3 4 5 6 7 8 9 a b c ... z
```

## Effort Levels

The small bars in the upper-right corner of each command box control effort.
Click a bar to set the level directly.

Use `Option-Up` and `Option-Down` to adjust the effort level for whichever
command box is focused. If you go back to a previous command, effort changes
travel with that previous command and affect reruns from that box.

Hover an effort bar to see exactly what generator it selects.

### Search Effort

| Level | Search generator | Exa behavior |
| --- | --- | --- |
| 1 | Exa Instant | `type instant`, 4 results |
| 2 | Exa Fast | `type fast`, 8 results |
| 3 | Exa Auto | `type auto`, 12 results |
| 4 | Exa Deep Lite | `type deep-lite`, 20 results |
| 5 | Exa Deep | `type deep`, 30 results |

### AI Effort

| Level | AI generator | Model |
| --- | --- | --- |
| 1 | OpenRouter GPT-4.1 Nano | `openai/gpt-4.1-nano` |
| 2 | OpenRouter GPT-4.1 Mini | `openai/gpt-4.1-mini` |
| 3 | OpenRouter Auto | `openrouter/auto` |
| 4 | OpenRouter GPT-4.1 | `openai/gpt-4.1` |
| 5 | OpenRouter GPT-5.5 | `openai/gpt-5.5-20260423` |

## History Navigation

Use `Up Arrow` and `Down Arrow` to move between command boxes.

- `Up Arrow` moves to the previous command.
- `Down Arrow` moves toward the current bottom prompt.
- When a previous command is not visible, zip.cat scrolls it to the top of the
  viewport.
- If the command is already visible, zip.cat does not scroll.

Clicking a previous command line also focuses it so you can edit and rerun it.

## Clearing

Use `Command-K` to clear old transcript entries while keeping whatever is
currently typed in the bottom command line.

## Keyboard Reference

| Shortcut | Action |
| --- | --- |
| `Enter` | Run the current command |
| `Left Arrow` at start | Toggle `>` / `*` |
| `Right Arrow` at end | Toggle `>` / `*` |
| `Up Arrow` | Move to previous command |
| `Down Arrow` | Move to next command |
| `Option-Up` | Increase focused command effort |
| `Option-Down` | Decrease focused command effort |
| Hold `Option` | Show open shortcuts |
| `Option` + shown key | Open result, suggestion, or AI link |
| `Command-K` | Clear transcript, keep current input |

## Tips

- Use low effort for quick navigational searches.
- Use high effort for research-heavy web searches.
- Use `*` with low effort for short transformations or summaries.
- Use `*` with high effort when you want a stronger model.
- Hover effort bars when unsure; the tooltip shows the exact generator.
