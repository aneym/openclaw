import { Volume2, Play, Pause } from "lucide-react";
import { useRef, useState, useEffect, useCallback } from "react";
import type { AudioPart } from "@/types/message";

interface AudioAttachmentProps {
  part: AudioPart;
}

function formatFilename(raw: string): string {
  const name = raw.includes("/") ? raw.slice(raw.lastIndexOf("/") + 1) : raw;
  if (/^voice-\d+\.\w+$/i.test(name)) return "Voice message";
  return name;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioAttachment({ part }: AudioAttachmentProps) {
  const label = formatFilename(part.filename || "Audio");
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onTime = () => setCurrentTime(el.currentTime);
    const onMeta = () => setDuration(el.duration);
    const onEnded = () => setPlaying(false);

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("ended", onEnded);
    };
  }, []);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play();
      setPlaying(true);
    }
  }, [playing]);

  const seek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = audioRef.current;
      if (!el || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      el.currentTime = ratio * duration;
    },
    [duration],
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2.5 max-w-[85%] min-w-[280px]">
      <audio ref={audioRef} preload="metadata" src={part.url} />

      {/* Play/pause button */}
      <button
        type="button"
        onClick={toggle}
        className="flex items-center justify-center size-9 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors shrink-0"
      >
        {playing ? (
          <Pause className="size-4 text-primary" />
        ) : (
          <Play className="size-4 text-primary ml-0.5" />
        )}
      </button>

      {/* Track + label */}
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Volume2 className="size-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
          </div>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {formatTime(currentTime)}
            {duration > 0 ? ` / ${formatTime(duration)}` : ""}
          </span>
        </div>

        {/* Custom scrubber */}
        <div className="relative h-1.5 rounded-full bg-border cursor-pointer group" onClick={seek}>
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary/60 group-hover:bg-primary transition-colors"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 size-3 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>
      </div>
    </div>
  );
}
