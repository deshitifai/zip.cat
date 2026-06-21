#!/usr/bin/env python3
import base64
import json
import struct
import sys
from pathlib import Path


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def decode_pcm16(payload: str) -> list[float]:
    data = base64.b64decode(payload)
    if not data:
        return []
    sample_count = len(data) // 2
    samples = struct.unpack(f"<{sample_count}h", data[: sample_count * 2])
    return [sample / 32768.0 for sample in samples]


def main() -> int:
    language = sys.argv[1] if len(sys.argv) > 1 else "en"
    cache_root = Path(__file__).resolve().parents[1] / ".moonshine-cache"

    try:
        from moonshine_voice import Transcriber, TranscriptEventListener, get_model_for_language
    except Exception as exc:
        emit({
            "type": "error",
            "error": "Moonshine Voice is not installed. Install it with: pip install moonshine-voice",
            "detail": str(exc),
        })
        return 3

    completed_lines: list[str] = []
    live_lines: dict[float, str] = {}

    def transcript_text() -> str:
        pending = [text.strip() for _, text in sorted(live_lines.items()) if text.strip()]
        return " ".join([*completed_lines, *pending]).strip()

    class Listener(TranscriptEventListener):
        def on_line_text_changed(self, event):
            text = event.line.text.strip()
            if text:
                live_lines[event.line.start_time] = text
            elif event.line.start_time in live_lines:
                del live_lines[event.line.start_time]
            emit({
                "type": "partial",
                "text": transcript_text(),
            })

        def on_line_completed(self, event):
            text = event.line.text.strip()
            if text:
                completed_lines.append(text)
            live_lines.pop(event.line.start_time, None)
            emit({
                "type": "final",
                "text": transcript_text(),
            })

        def on_error(self, event):
            emit({
                "type": "error",
                "error": str(event.error),
            })

    try:
        model_path, model_arch = get_model_for_language(language, cache_root=cache_root)
        transcriber = Transcriber(model_path=model_path, model_arch=model_arch)
        stream = transcriber.create_stream(update_interval=0.12)
        stream.add_listener(Listener())
        stream.start()
        emit({"type": "ready"})

        current_sample_rate = 16000
        for line in sys.stdin:
            if not line.strip():
                continue
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                emit({"type": "error", "error": "Invalid streaming message."})
                continue

            message_type = message.get("type")
            if message_type == "start":
                current_sample_rate = int(message.get("sampleRate") or current_sample_rate)
                emit({"type": "ready"})
            elif message_type == "audio":
                sample_rate = int(message.get("sampleRate") or current_sample_rate)
                audio = decode_pcm16(str(message.get("audio") or ""))
                if audio:
                    stream.add_audio(audio, sample_rate)
            elif message_type == "stop":
                stream.stop()
                emit({
                    "type": "final",
                    "text": transcript_text(),
                })
                break
            elif message_type == "close":
                break

        stream.close()
        transcriber.close()
        emit({
            "type": "done",
            "text": transcript_text(),
        })
        return 0
    except Exception as exc:
        emit({
            "type": "error",
            "error": str(exc),
        })
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
