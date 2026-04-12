#!/usr/bin/env bash
set -euo pipefail

VIDEO_SOURCE=""
ATMOS_SOURCE=""
OUTPUT_DIR=""
ALLOW_FPS_CONVERSION=0
OVERWRITE=1

usage() {
  cat <<'USAGE'
Usage:
  atmos_mux.sh --video <video.mp4> --atmos <atmos.mp4> --output-dir <directory> [--allow-fps-conversion] [--no-overwrite]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --video)
      VIDEO_SOURCE="${2:-}"
      shift 2
      ;;
    --atmos)
      ATMOS_SOURCE="${2:-}"
      shift 2
      ;;
    --output-dir)
      OUTPUT_DIR="${2:-}"
      shift 2
      ;;
    --allow-fps-conversion)
      ALLOW_FPS_CONVERSION=1
      shift
      ;;
    --no-overwrite)
      OVERWRITE=0
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$VIDEO_SOURCE" || -z "$ATMOS_SOURCE" || -z "$OUTPUT_DIR" ]]; then
  echo "Missing required arguments." >&2
  usage >&2
  exit 2
fi

if [[ ! -f "$VIDEO_SOURCE" ]]; then
  echo "Video source does not exist: $VIDEO_SOURCE" >&2
  exit 2
fi

if [[ ! -f "$ATMOS_SOURCE" ]]; then
  echo "Atmos source does not exist: $ATMOS_SOURCE" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESOURCE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BIN_DIR="$RESOURCE_ROOT/bin"
FFMPEG="$BIN_DIR/ffmpeg"
FFPROBE="$BIN_DIR/ffprobe"
DEMUXER="$BIN_DIR/mp4demuxer"
MUXER="$BIN_DIR/mp4muxer"

for tool in "$FFMPEG" "$FFPROBE" "$DEMUXER" "$MUXER"; do
  if [[ ! -x "$tool" ]]; then
    echo "Required tool is missing or not executable: $tool" >&2
    exit 3
  fi
done

mkdir -p "$OUTPUT_DIR"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/presto-atmos-mux.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT

VIDEO_DEMUX_DIR="$WORK_DIR/video_demux"
ATMOS_DEMUX_DIR="$WORK_DIR/atmos_demux"
mkdir -p "$VIDEO_DEMUX_DIR" "$ATMOS_DEMUX_DIR"

fps_raw() {
  "$FFPROBE" -v error -select_streams v:0 -show_entries stream=r_frame_rate -of default=noprint_wrappers=1:nokey=1 "$1"
}

fps_decimal() {
  local value="$1"
  if [[ -z "$value" ]]; then
    echo "0"
    return
  fi

  if [[ "$value" == */* ]]; then
    local numerator="${value%/*}"
    local denominator="${value#*/}"
    if [[ "$denominator" == "0" ]]; then
      echo "0"
      return
    fi
    awk -v num="$numerator" -v den="$denominator" 'BEGIN { printf "%.6f", num / den }'
    return
  fi

  echo "$value"
}

fps_diff_exceeds_threshold() {
  local left="$1"
  local right="$2"
  awk -v left="$left" -v right="$right" 'BEGIN {
    diff = left - right
    if (diff < 0) {
      diff = -diff
    }
    if (diff > 0.01) {
      exit 0
    }
    exit 1
  }'
}

VIDEO_FPS_RAW="$(fps_raw "$VIDEO_SOURCE" || true)"
ATMOS_FPS_RAW="$(fps_raw "$ATMOS_SOURCE" || true)"
VIDEO_FPS_DEC="$(fps_decimal "$VIDEO_FPS_RAW")"
ATMOS_FPS_DEC="$(fps_decimal "$ATMOS_FPS_RAW")"

TARGET_FPS_RAW="25"
if [[ -n "$ATMOS_FPS_RAW" && "$ATMOS_FPS_DEC" != "0" ]]; then
  TARGET_FPS_RAW="$ATMOS_FPS_RAW"
elif [[ -n "$VIDEO_FPS_RAW" && "$VIDEO_FPS_DEC" != "0" ]]; then
  TARGET_FPS_RAW="$VIDEO_FPS_RAW"
fi

SKIP_VIDEO_DEMUX=0
VIDEO_STREAM=""
STEREO_STREAM=""

if [[ -n "$VIDEO_FPS_RAW" && -n "$ATMOS_FPS_RAW" ]] && fps_diff_exceeds_threshold "$VIDEO_FPS_DEC" "$ATMOS_FPS_DEC"; then
  if [[ "$ALLOW_FPS_CONVERSION" -ne 1 ]]; then
    echo "FPS mismatch detected and conversion is disabled." >&2
    echo "VIDEO_FPS_DEC=$VIDEO_FPS_DEC" >&2
    echo "ATMOS_FPS_DEC=$ATMOS_FPS_DEC" >&2
    exit 4
  fi

  VIDEO_STREAM="$WORK_DIR/video_converted.h264"
  "$FFMPEG" -i "$VIDEO_SOURCE" -r "$ATMOS_FPS_DEC" -c:v libx264 -preset fast -crf 23 -bsf:v h264_mp4toannexb -f h264 "$VIDEO_STREAM" -y >/dev/null 2>&1

  HAS_AUDIO="$($FFPROBE -v error -select_streams a:0 -show_entries stream=codec_type -of csv=p=0 "$VIDEO_SOURCE" || true)"
  if [[ -n "$HAS_AUDIO" ]]; then
    STEREO_STREAM="$WORK_DIR/audio_extracted.m4a"
    "$FFMPEG" -i "$VIDEO_SOURCE" -vn -c:a copy "$STEREO_STREAM" -y >/dev/null 2>&1 || true
    if [[ ! -f "$STEREO_STREAM" ]]; then
      STEREO_STREAM=""
    fi
  fi

  SKIP_VIDEO_DEMUX=1
  VIDEO_FPS_RAW="$ATMOS_FPS_RAW"
  VIDEO_FPS_DEC="$ATMOS_FPS_DEC"
fi

if [[ "$SKIP_VIDEO_DEMUX" -ne 1 ]]; then
  "$DEMUXER" --input-file "$VIDEO_SOURCE" --output-folder "$VIDEO_DEMUX_DIR" >"$WORK_DIR/demux_video.log" 2>&1
  VIDEO_STREAM="$(find "$VIDEO_DEMUX_DIR" -type f -not -name '.DS_Store' -print0 | xargs -0 ls -S 2>/dev/null | head -n 1)"
  STEREO_STREAM="$(find "$VIDEO_DEMUX_DIR" -type f \( -name '*.aac' -o -name '*.m4a' -o -name '*.mp4a' \) | head -n 1)"
fi

"$DEMUXER" --input-file "$ATMOS_SOURCE" --output-folder "$ATMOS_DEMUX_DIR" >"$WORK_DIR/demux_atmos.log" 2>&1
ATMOS_STREAM="$(find "$ATMOS_DEMUX_DIR" -type f \( -name '*.ec3' -o -name '*.ac4' -o -name '*.ac3' \) | head -n 1)"

if [[ -z "$VIDEO_STREAM" ]]; then
  echo "Unable to locate demuxed video stream." >&2
  exit 5
fi

if [[ -z "$ATMOS_STREAM" ]]; then
  echo "Unable to locate Atmos stream (.ec3/.ac4/.ac3)." >&2
  exit 5
fi

OUTPUT_FILENAME="Atmos_Output_$(date +%Y%m%d_%H%M%S).mp4"
OUTPUT_PATH="$OUTPUT_DIR/$OUTPUT_FILENAME"

CMD_ARGS=("-i" "$VIDEO_STREAM" "--input-video-frame-rate" "$TARGET_FPS_RAW")
if [[ "$OVERWRITE" -eq 1 ]]; then
  CMD_ARGS+=("--overwrite")
fi
CMD_ARGS+=("-i" "$ATMOS_STREAM" "--media-lang" "eng")
if [[ -n "$STEREO_STREAM" && -f "$STEREO_STREAM" ]]; then
  CMD_ARGS+=("-i" "$STEREO_STREAM" "--media-lang" "eng")
fi
CMD_ARGS+=("-o" "$OUTPUT_PATH")

MUX_LOG="$WORK_DIR/mux.log"
set +e
"$MUXER" "${CMD_ARGS[@]}" >"$MUX_LOG" 2>&1
EXIT_CODE=$?
set -e

if [[ "$EXIT_CODE" -ne 0 ]] && grep -q "can't handle the level" "$MUX_LOG"; then
  VIDEO_STREAM_FIXED="${VIDEO_STREAM%.*}_fixed.h264"
  "$FFMPEG" -i "$VIDEO_STREAM" -c:v copy -bsf:v h264_metadata=level=5.1 "$VIDEO_STREAM_FIXED" -y >/dev/null 2>&1
  CMD_ARGS[1]="$VIDEO_STREAM_FIXED"

  set +e
  "$MUXER" "${CMD_ARGS[@]}" >"$MUX_LOG" 2>&1
  EXIT_CODE=$?
  set -e
fi

if [[ "$EXIT_CODE" -ne 0 ]]; then
  cat "$MUX_LOG" >&2
  exit "$EXIT_CODE"
fi

echo "OUTPUT_PATH=$OUTPUT_PATH"
echo "VIDEO_FPS_RAW=$VIDEO_FPS_RAW"
echo "ATMOS_FPS_RAW=$ATMOS_FPS_RAW"
echo "TARGET_FPS_RAW=$TARGET_FPS_RAW"
