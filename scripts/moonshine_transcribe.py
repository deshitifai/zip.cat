#!/usr/bin/env python3
import json
import sys
from pathlib import Path
from typing import Iterator, Tuple


def audio_chunks(wav_path: str, chunk_duration: float = 0.1) -> Iterator[Tuple[list, int]]:
    from moonshine_voice import load_wav_file

    audio_data, sample_rate = load_wav_file(wav_path)
    chunk_size = max(1, int(chunk_duration * sample_rate))
    for offset in range(0, len(audio_data), chunk_size):
        yield audio_data[offset : offset + chunk_size], sample_rate


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: moonshine_transcribe.py <audio.wav> [language]", file=sys.stderr)
        return 2

    wav_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else "en"

    try:
        from moonshine_voice import Transcriber, TranscriptEventListener, get_model_for_language
    except Exception as exc:
        print(
            "Moonshine Voice is not installed. Install it with: pip install moonshine-voice",
            file=sys.stderr,
        )
        print(str(exc), file=sys.stderr)
        return 3

    completed_lines: list[str] = []
    latest_lines: dict[float, str] = {}

    class Listener(TranscriptEventListener):
        def on_line_text_changed(self, event):
            latest_lines[event.line.start_time] = event.line.text

        def on_line_completed(self, event):
            text = event.line.text.strip()
            if text:
                completed_lines.append(text)
            latest_lines.pop(event.line.start_time, None)

    cache_root = Path(__file__).resolve().parents[1] / ".moonshine-cache"
    model_path, model_arch = get_model_for_language(language, cache_root=cache_root)
    transcriber = Transcriber(model_path=model_path, model_arch=model_arch)
    stream = transcriber.create_stream(update_interval=0.2)
    listener = Listener()

    try:
        stream.add_listener(listener)
        stream.start()
        for chunk, sample_rate in audio_chunks(wav_path):
            stream.add_audio(chunk, sample_rate)
        stream.stop()
        pending = [text.strip() for _, text in sorted(latest_lines.items()) if text.strip()]
        text = " ".join([*completed_lines, *pending]).strip()
        print(json.dumps({"text": text}))
        return 0
    finally:
        stream.close()
        transcriber.close()


if __name__ == "__main__":
    raise SystemExit(main())
