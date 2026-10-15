
import os
import shutil
import uuid
import logging

from flask import Flask, render_template, request, jsonify, send_file
from pydub import AudioSegment
from werkzeug.utils import secure_filename


# --------------------------------------------------
# Flask Application
# --------------------------------------------------

app = Flask(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
OUTPUT_FOLDER = os.path.join(BASE_DIR, "outputs")

# Maximum total request size: 50 MB
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024

os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {
    "mp3", "wav", "ogg", "m4a", "aac", "flac", "mp4"
}


# --------------------------------------------------
# Configure FFmpeg and FFprobe
# --------------------------------------------------

# First, try your Windows FFmpeg installation.
WINDOWS_FFMPEG_FOLDER = os.path.join(
    os.path.expanduser("~"),
    "Downloads",
    "ffmpeg-master-latest-win64-gpl",
    "ffmpeg-master-latest-win64-gpl",
    "bin"
)

WINDOWS_FFMPEG = os.path.join(
    WINDOWS_FFMPEG_FOLDER, "ffmpeg.exe"
)

WINDOWS_FFPROBE = os.path.join(
    WINDOWS_FFMPEG_FOLDER, "ffprobe.exe"
)

# If the Windows paths do not exist, look in the system PATH.
FFMPEG_PATH = (
    WINDOWS_FFMPEG
    if os.path.isfile(WINDOWS_FFMPEG)
    else shutil.which("ffmpeg")
)

FFPROBE_PATH = (
    WINDOWS_FFPROBE
    if os.path.isfile(WINDOWS_FFPROBE)
    else shutil.which("ffprobe")
)

# Stop early if FFmpeg is unavailable.
if not FFMPEG_PATH:
    raise FileNotFoundError(
        "FFmpeg was not found. Install FFmpeg or add it to PATH."
    )

if not FFPROBE_PATH:
    raise FileNotFoundError(
        "FFprobe was not found. Install FFprobe or add it to PATH."
    )

# Tell Pydub which executables to use.
AudioSegment.converter = FFMPEG_PATH
AudioSegment.ffmpeg = FFMPEG_PATH
AudioSegment.ffprobe = FFPROBE_PATH

# Pydub's media information utility also needs FFprobe.
import pydub.utils

pydub.utils.get_prober_name = lambda: FFPROBE_PATH

print("FFmpeg path:", FFMPEG_PATH)
print("FFprobe path:", FFPROBE_PATH)
print("FFmpeg exists:", os.path.isfile(FFMPEG_PATH))
print("FFprobe exists:", os.path.isfile(FFPROBE_PATH))


# --------------------------------------------------
# Helper Functions
# --------------------------------------------------

def allowed_file(filename):
    """Return True if the file has a supported extension."""
    return (
        "." in filename
        and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS
    )


def get_audio_duration(audio):
    """Return the duration of an audio segment in seconds."""
    return len(audio) / 1000


def load_audio(file_path):
    """Load a supported audio file or extract audio from an MP4."""
    extension = os.path.splitext(file_path)[1].lower()

    if extension == ".mp4":
        return AudioSegment.from_file(file_path, format="mp4")

    return AudioSegment.from_file(file_path)


def save_mp3(audio, output_path):
    """Export an audio segment as an MP3 file."""
    audio.export(
        output_path,
        format="mp3",
        bitrate="192k"
    )


def save_uploaded_file(uploaded_file):
    """Save an upload using a unique temporary filename."""
    original_name = secure_filename(uploaded_file.filename)

    if not original_name or not allowed_file(original_name):
        raise ValueError("Unsupported file format.")

    extension = original_name.rsplit(".", 1)[1].lower()
    filename = f"{uuid.uuid4().hex}.{extension}"
    file_path = os.path.join(UPLOAD_FOLDER, filename)

    uploaded_file.save(file_path)
    return file_path


def parse_time_range(form, index, audio_duration):
    """Read and validate a song's start and end times in seconds."""
    try:
        start = float(form.get(f"start_{index}", "0"))
        end_text = form.get(f"end_{index}", "").strip()
        end = float(end_text) if end_text else audio_duration
    except (ValueError, TypeError):
        raise ValueError(
            f"Please enter valid times for song {index + 1}."
        )

    if (
        start < 0
        or end <= start
        or end > audio_duration
    ):
        raise ValueError(
            f"Invalid time range for song {index + 1}. "
            f"Use a start before the end, within "
            f"the song's duration of {audio_duration:.2f} seconds."
        )

    return start, end


# --------------------------------------------------
# Home Page
# --------------------------------------------------

@app.route("/")
def home():
    return render_template("index.html")


# --------------------------------------------------
# Song Splitter Page
# --------------------------------------------------

@app.route("/splitter")
def splitter():
    return render_template("splitter.html")


# --------------------------------------------------
# Song Merger Page
# --------------------------------------------------

@app.route("/merger")
def merger():
    return render_template("merger.html")


# --------------------------------------------------
# Trim One Song - Existing Endpoint
# --------------------------------------------------

@app.route("/api/trim", methods=["POST"])
def trim_song():
    input_path = None
    output_path = None

    try:
        uploaded_file = request.files.get("song")

        if not uploaded_file or not uploaded_file.filename:
            return jsonify({
                "error": "Please select an audio or video file."
            }), 400

        input_path = save_uploaded_file(uploaded_file)
        audio = load_audio(input_path)
        duration = get_audio_duration(audio)

        try:
            start = float(request.form.get("start", "0"))
            end = float(request.form.get("end", "0"))
        except (ValueError, TypeError):
            return jsonify({
                "error": "Please enter valid start and end times."
            }), 400

        if start < 0 or end <= start or end > duration:
            return jsonify({
                "error": (
                    f"Choose a valid time range between 0 and "
                    f"{duration:.2f} seconds."
                )
            }), 400

        selected_audio = audio[int(start * 1000):int(end * 1000)]

        if len(selected_audio) == 0:
            return jsonify({
                "error": "The selected audio section is empty."
            }), 400

        output_name = f"{uuid.uuid4().hex}.mp3"
        output_path = os.path.join(OUTPUT_FOLDER, output_name)
        save_mp3(selected_audio, output_path)

        return jsonify({
            "message": "Song trimmed successfully!",
            "filename": output_name,
            "duration": round(get_audio_duration(selected_audio), 2),
            "download_url": f"/api/download/{output_name}"
        })

    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    except Exception:
        app.logger.exception("Single-song trimming failed.")
        return jsonify({
            "error": (
                "Audio processing failed. Check the VS Code terminal."
            )
        }), 500

    finally:
        if input_path and os.path.exists(input_path):
            try:
                os.remove(input_path)
            except OSError:
                app.logger.warning(
                    "Could not remove temporary upload: %s", input_path
                )


# --------------------------------------------------
# Trim Multiple Songs
# --------------------------------------------------

@app.route("/api/trim-multiple", methods=["POST"])
def trim_multiple_songs():
    temporary_files = []
    created_outputs = []

    try:
        # The HTML sends every selected file under the "songs" field.
        uploaded_files = [
            file for file in request.files.getlist("songs")
            if file and file.filename
        ]

        if not uploaded_files:
            return jsonify({
                "error": "Please select at least one song."
            }), 400

        if len(uploaded_files) > 10:
            return jsonify({
                "error": "You can trim a maximum of 10 songs at a time."
            }), 400

        clips = []

        for index, uploaded_file in enumerate(uploaded_files):
            # Save and load this song.
            input_path = save_uploaded_file(uploaded_file)
            temporary_files.append(input_path)

            audio = load_audio(input_path)
            duration = get_audio_duration(audio)

            # Each song has its own start_N and end_N fields.
            start, end = parse_time_range(
                request.form, index, duration
            )

            selected_audio = audio[
                int(start * 1000):int(end * 1000)
            ]

            if len(selected_audio) == 0:
                raise ValueError(
                    f"The selected portion of song {index + 1} is empty."
                )

            # Save each trimmed song separately.
            output_name = f"{uuid.uuid4().hex}.mp3"
            output_path = os.path.join(OUTPUT_FOLDER, output_name)

            save_mp3(selected_audio, output_path)
            created_outputs.append(output_path)

            clips.append({
                "song_number": index + 1,
                "original_name": secure_filename(
                    uploaded_file.filename
                ),
                "filename": output_name,
                "duration": round(
                    get_audio_duration(selected_audio), 2
                ),
                "download_url": f"/api/download/{output_name}"
            })

        return jsonify({
            "message": f"Successfully trimmed {len(clips)} song(s).",
            "clips": clips
        })

    except ValueError as error:
        # Remove outputs already created if a later song fails.
        for path in created_outputs:
            if os.path.exists(path):
                os.remove(path)

        return jsonify({"error": str(error)}), 400

    except Exception:
        app.logger.exception("Multiple-song trimming failed.")

        for path in created_outputs:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    app.logger.warning(
                        "Could not remove failed output: %s", path
                    )

        return jsonify({
            "error": (
                "Unable to trim the songs. "
                "Check the VS Code terminal for details."
            )
        }), 500

    finally:
        # Always remove temporary uploads.
        for path in temporary_files:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    app.logger.warning(
                        "Could not remove temporary upload: %s", path
                    )


# --------------------------------------------------
# Merge Multiple Songs - Existing Endpoint
# --------------------------------------------------

@app.route("/api/merge", methods=["POST"])
def merge_songs():
    temporary_files = []
    output_path = None

    try:
        uploaded_files = [
            file for file in request.files.getlist("songs")
            if file and file.filename
        ]

        if len(uploaded_files) < 2:
            return jsonify({
                "error": "Please upload at least two songs to merge."
            }), 400

        if len(uploaded_files) > 10:
            return jsonify({
                "error": "You can merge a maximum of 10 songs at a time."
            }), 400

        merged_audio = None

        for index, uploaded_file in enumerate(uploaded_files):
            input_path = save_uploaded_file(uploaded_file)
            temporary_files.append(input_path)

            song = load_audio(input_path)
            duration = get_audio_duration(song)

            start, end = parse_time_range(
                request.form, index, duration
            )

            song = song[int(start * 1000):int(end * 1000)]

            try:
                fade_in = int(request.form.get(f"fade_in_{index}", "0"))
                fade_out = int(request.form.get(f"fade_out_{index}", "0"))
            except (ValueError, TypeError):
                raise ValueError("Fade values must be whole numbers.")

            # Fade values are entered in milliseconds.
            fade_in = max(0, min(fade_in, len(song)))
            fade_out = max(0, min(fade_out, len(song)))

            if fade_in:
                song = song.fade_in(fade_in)

            if fade_out:
                song = song.fade_out(fade_out)

            merged_audio = (
                song if merged_audio is None else merged_audio + song
            )

        if merged_audio is None or len(merged_audio) == 0:
            raise ValueError("The merged audio is empty.")

        output_name = f"{uuid.uuid4().hex}.mp3"
        output_path = os.path.join(OUTPUT_FOLDER, output_name)
        save_mp3(merged_audio, output_path)

        return jsonify({
            "message": "Songs merged successfully!",
            "filename": output_name,
            "duration": round(get_audio_duration(merged_audio), 2),
            "download_url": f"/api/download/{output_name}"
        })

    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    except Exception:
        app.logger.exception("Song merging failed.")

        if output_path and os.path.exists(output_path):
            try:
                os.remove(output_path)
            except OSError:
                pass

        return jsonify({
            "error": (
                "Unable to merge songs. "
                "Check the VS Code terminal for details."
            )
        }), 500

    finally:
        for path in temporary_files:
            if os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    app.logger.warning(
                        "Could not remove temporary upload: %s", path
                    )


# --------------------------------------------------
# Download Processed MP3
# --------------------------------------------------

@app.route("/api/download/<filename>")
def download_audio(filename):
    # Only generated MP3 files are downloadable.
    if (
        not filename.endswith(".mp3")
        or os.path.basename(filename) != filename
    ):
        return jsonify({"error": "Invalid filename."}), 400

    file_path = os.path.join(OUTPUT_FOLDER, filename)

    if not os.path.isfile(file_path):
        return jsonify({"error": "Audio file not found."}), 404

    return send_file(
        file_path,
        as_attachment=True,
        download_name="tirths_audio.mp3"
    )


# --------------------------------------------------
# Handle Files Larger Than 50 MB
# --------------------------------------------------

@app.errorhandler(413)
def file_too_large(error):
    return jsonify({
        "error": (
            "The upload is too large. "
            "The maximum request size is 50 MB."
        )
    }), 413


# --------------------------------------------------
# Run the Application
# --------------------------------------------------

if __name__ == "__main__":
    app.run(debug=True)
