/**
 * Azhura CBT App — Custom exam media player (#164).
 *
 * A neobrutalist audio/video player built on Vidstack's headless primitives,
 * replacing the native `<audio/video controls>` so question media can enforce
 * exam-integrity rules:
 *   - **no download** — no native controls / download affordance + context-menu
 *     suppressed, so a clip can't be saved off the workstation;
 *   - **max plays**   — a per-clip play budget (counted on each completed
 *     playthrough, persisted via {@link useMediaIntegrity});
 *   - **seek lock**   — an optional read-only timeline (no scrubbing).
 *
 * Vidstack's own keyboard shortcuts are disabled (`keyDisabled`) so play can't
 * be started once the budget is spent; the custom controls below are native
 * `<button>`/`<input>` elements and stay fully keyboard-accessible on their own.
 */

import { useId } from "react";
import {
  MediaPlayer as VidstackPlayer,
  MediaProvider,
  useMediaState,
  useMediaRemote,
  formatTime,
} from "@vidstack/react";
import { Play, Pause, Volume2, VolumeX, RotateCcw, Lock } from "lucide-react";
import { useMediaIntegrity, type MediaIntegrityState } from "../../hooks/useMediaIntegrity";
import "@vidstack/react/player/styles/base.css";
import "./media-player.css";

interface MediaPlayerProps {
  /** Resolved absolute media URL. */
  src: string;
  type: "audio" | "video";
  /** Owning question id, for per-question play-count persistence. */
  questionId?: string;
  /** Play-count cap; null = unlimited. */
  maxPlays: number | null;
  /** When true, the timeline is locked (no scrubbing). */
  noSeek: boolean;
}

export function MediaPlayer({ src, type, questionId, maxPlays, noSeek }: MediaPlayerProps) {
  const integrity = useMediaIntegrity({ questionId, src, maxPlays, noSeek });

  return (
    <VidstackPlayer
      className={`nb-media-player nb-media-player--${type}`}
      src={src}
      viewType={type}
      streamType="on-demand"
      playsInline
      keyDisabled
      // Block right-click → "Save audio/video as…" as a download vector.
      onContextMenu={(e) => e.preventDefault()}
      onPlay={integrity.registerPlayStart}
      onEnded={integrity.registerEnded}
      aria-label={type === "audio" ? "Pemutar audio soal" : "Pemutar video soal"}
    >
      <MediaProvider />
      <PlayerControls integrity={integrity} type={type} />
    </VidstackPlayer>
  );
}

interface PlayerControlsProps {
  integrity: MediaIntegrityState;
  type: "audio" | "video";
}

function PlayerControls({ integrity, type }: PlayerControlsProps) {
  const paused = useMediaState("paused");
  const currentTime = useMediaState("currentTime");
  const duration = useMediaState("duration");
  const muted = useMediaState("muted");
  const volume = useMediaState("volume");
  const ended = useMediaState("ended");
  const remote = useMediaRemote();

  const seekId = useId();
  const volumeId = useId();

  const { limitReached, noSeek, maxPlays, playsRemaining } = integrity;
  // A play is counted at the START of a run (see useMediaIntegrity), so the
  // budget only gates STARTING A NEW run — at the clip's beginning or after it
  // ended. Resuming a run that is already in progress (paused mid-clip) is
  // always allowed, otherwise pausing your one allowed play would strand it.
  const atRunBoundary = currentTime <= 0 || (duration > 0 && currentTime >= duration);
  const startBlocked = paused && limitReached && atRunBoundary;
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  const togglePlay = () => {
    if (paused) {
      if (limitReached && atRunBoundary) return;
      remote.play();
    } else {
      remote.pause();
    }
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (noSeek) return;
    remote.seek(Number(e.target.value));
  };

  const onVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    remote.changeVolume(v);
    if (v > 0 && muted) remote.unmute();
  };

  return (
    <div className="nb-media-controls" data-type={type}>
      <button
        type="button"
        className="nb-media-btn nb-media-btn--play"
        onClick={togglePlay}
        disabled={startBlocked}
        aria-label={paused ? (ended ? "Putar ulang" : "Putar") : "Jeda"}
        title={startBlocked ? "Batas jumlah putar tercapai" : paused ? "Putar" : "Jeda"}
      >
        {!paused ? (
          <Pause className="size-4" aria-hidden />
        ) : ended ? (
          <RotateCcw className="size-4" aria-hidden />
        ) : (
          <Play className="size-4" aria-hidden />
        )}
      </button>

      <span className="nb-media-time tabular" aria-hidden>
        {formatTime(currentTime)} / {formatTime(duration || 0)}
      </span>

      {/* Timeline — interactive slider, or a read-only progress bar when locked. */}
      {noSeek ? (
        <div
          className="nb-media-track nb-media-track--locked"
          role="progressbar"
          aria-label="Posisi pemutaran (terkunci)"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <span className="nb-media-track-fill" style={{ width: `${progress * 100}%` }} />
          <Lock className="nb-media-lock size-3" aria-hidden />
        </div>
      ) : (
        <label className="nb-media-seek-wrap">
          <span className="sr-only">Posisi pemutaran</span>
          <input
            id={seekId}
            className="nb-media-range nb-media-range--seek"
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(currentTime, duration || 0)}
            onChange={onSeek}
            aria-label="Posisi pemutaran"
          />
        </label>
      )}

      <div className="nb-media-volume">
        <button
          type="button"
          className="nb-media-btn nb-media-btn--mute"
          onClick={() => remote.toggleMuted()}
          aria-label={muted || volume === 0 ? "Bunyikan" : "Bisukan"}
        >
          {muted || volume === 0 ? (
            <VolumeX className="size-4" aria-hidden />
          ) : (
            <Volume2 className="size-4" aria-hidden />
          )}
        </button>
        <label className="nb-media-volume-wrap">
          <span className="sr-only">Volume</span>
          <input
            id={volumeId}
            className="nb-media-range nb-media-range--volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={onVolume}
            aria-label="Volume"
          />
        </label>
      </div>

      {/* Play-budget indicator (only when a cap is set). */}
      {maxPlays != null && (
        <span
          className={`nb-media-plays${limitReached ? " nb-media-plays--done" : ""}`}
          role="status"
        >
          {limitReached ? "Batas putar tercapai" : `Sisa putar: ${playsRemaining}×`}
        </span>
      )}
    </div>
  );
}
