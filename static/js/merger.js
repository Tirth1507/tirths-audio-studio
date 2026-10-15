// ==================================================
// Tirth's Audio Studio - Song Merger
// ==================================================

// Get HTML elements.
const songFilesInput = document.getElementById("songFiles");
const songList = document.getElementById("songList");
const songCount = document.getElementById("songCount");
const mergeButton = document.getElementById("mergeButton");
const statusMessage = document.getElementById("statusMessage");

const resultSection = document.getElementById("resultSection");
const mergedAudio = document.getElementById("mergedAudio");
const downloadButton = document.getElementById("downloadButton");

// Store selected songs and their settings.
let songs = [];

// Allowed file extensions.
const allowedExtensions = [
    "mp3",
    "wav",
    "ogg",
    "m4a",
    "aac",
    "flac",
    "mp4"
];


// --------------------------------------------------
// Handle File Selection
// --------------------------------------------------

songFilesInput.addEventListener("change", function () {

    // Clear the old playlist when new files are selected.
    songs = [];

    const selectedFiles = Array.from(this.files);

    for (const file of selectedFiles) {

        const extension = file.name
            .split(".")
            .pop()
            .toLowerCase();

        // Ignore unsupported files.
        if (!allowedExtensions.includes(extension)) {
            alert(`Unsupported file format: ${file.name}`);
            continue;
        }

        // Add each song with default settings.
        songs.push({
            file: file,
            start: 0,
            end: null,
            fadeIn: 0,
            fadeOut: 0
        });
    }

    // Refresh the playlist.
    renderSongs();

    // Reset previous output.
    resetResult();

    if (songs.length < 2) {
        showStatus("Please select at least two supported files.", true);
    } else {
        showStatus("Songs selected successfully.", false);
    }
});


// --------------------------------------------------
// Display Playlist
// --------------------------------------------------

function renderSongs() {

    songList.innerHTML = "";

    songCount.textContent =
        `${songs.length} ${songs.length === 1 ? "song" : "songs"}`;

    mergeButton.disabled = songs.length < 2;

    if (songs.length === 0) {

        const emptyMessage = document.createElement("p");

        emptyMessage.textContent =
            "Your selected songs will appear here.";

        songList.appendChild(emptyMessage);

        return;
    }

    songs.forEach((song, index) => {

        // Create a card for each song.
        const card = document.createElement("div");

        card.className = "song-card";

        // Song title.
        const title = document.createElement("h3");

        title.textContent = `${index + 1}. ${song.file.name}`;

        card.appendChild(title);

        // File size.
        const fileInfo = document.createElement("p");

        fileInfo.className = "helper-text";

        fileInfo.textContent =
            `File size: ${(song.file.size / (1024 * 1024)).toFixed(2)} MB`;

        card.appendChild(fileInfo);

        // Reordering buttons.
        const reorderControls = document.createElement("div");

        reorderControls.className = "song-controls";

        const upButton = createButton("↑ Move Up", function () {

            if (index > 0) {

                [songs[index - 1], songs[index]] =
                    [songs[index], songs[index - 1]];

                renderSongs();
            }

        });

        upButton.disabled = index === 0;

        const downButton = createButton("↓ Move Down", function () {

            if (index < songs.length - 1) {

                [songs[index], songs[index + 1]] =
                    [songs[index + 1], songs[index]];

                renderSongs();
            }

        });

        downButton.disabled = index === songs.length - 1;

        const removeButton = createButton("✖ Remove", function () {

            songs.splice(index, 1);

            renderSongs();

            resetResult();

            showStatus("Song removed from the playlist.", false);

        });

        reorderControls.appendChild(upButton);
        reorderControls.appendChild(downButton);
        reorderControls.appendChild(removeButton);

        card.appendChild(reorderControls);

        // Start time input.
        card.appendChild(
            createLabel("Start time (seconds)")
        );

        const startInput = createNumberInput(
            song.start,
            0,
            function (value) {

                song.start = value;

                resetResult();

            }
        );

        card.appendChild(startInput);

        // End time input.
        card.appendChild(
            createLabel(
                "End time (seconds, leave empty for the full song)"
            )
        );

        const endInput = document.createElement("input");

        endInput.type = "number";
        endInput.min = "0";
        endInput.step = "0.1";
        endInput.placeholder = "Full song";

        if (song.end !== null) {
            endInput.value = song.end;
        }

        endInput.addEventListener("change", function () {

            if (this.value.trim() === "") {

                song.end = null;

            } else {

                song.end = Number(this.value);

            }

            resetResult();

        });

        card.appendChild(endInput);

        // Fade-in setting.
        card.appendChild(
            createLabel("Fade-in (milliseconds)")
        );

        const fadeInInput = createNumberInput(
            song.fadeIn,
            0,
            function (value) {

                song.fadeIn = value;

                resetResult();

            }
        );

        card.appendChild(fadeInInput);

        // Fade-out setting.
        card.appendChild(
            createLabel("Fade-out (milliseconds)")
        );

        const fadeOutInput = createNumberInput(
            song.fadeOut,
            0,
            function (value) {

                song.fadeOut = value;

                resetResult();

            }
        );

        card.appendChild(fadeOutInput);

        songList.appendChild(card);
    });

}


// --------------------------------------------------
// Create Reusable Buttons
// --------------------------------------------------

function createButton(text, clickHandler) {

    const button = document.createElement("button");

    button.type = "button";
    button.textContent = text;

    button.addEventListener("click", clickHandler);

    return button;
}


// --------------------------------------------------
// Create Input Labels
// --------------------------------------------------

function createLabel(text) {

    const label = document.createElement("label");

    label.textContent = text;

    return label;
}


// --------------------------------------------------
// Create Numeric Input
// --------------------------------------------------

function createNumberInput(value, minimum, onChange) {

    const input = document.createElement("input");

    input.type = "number";
    input.min = String(minimum);
    input.step = "0.1";
    input.value = value;

    input.addEventListener("change", function () {

        const number = Number(this.value);

        if (!Number.isFinite(number) || number < minimum) {

            this.value = minimum;

        }

        onChange(Number(this.value));

    });

    return input;
}


// --------------------------------------------------
// Merge Songs
// --------------------------------------------------

mergeButton.addEventListener("click", async function () {

    if (songs.length < 2) {

        showStatus("Please select at least two songs.", true);

        return;
    }

    const formData = new FormData();

    // Add every song and its settings.
    songs.forEach((song, index) => {

        formData.append("songs", song.file);

        formData.append(`start_${index}`, song.start);

        formData.append(
            `end_${index}`,
            song.end === null ? "" : song.end
        );

        formData.append(`fade_in_${index}`, song.fadeIn);

        formData.append(`fade_out_${index}`, song.fadeOut);

    });

    // Disable the button during processing.
    mergeButton.disabled = true;

    mergeButton.textContent = "⏳ Merging Songs...";

    showStatus(
        "Please wait while your songs are being merged...",
        false
    );

    resetResult();

    try {

        // Send songs to the Flask backend.
        const response = await fetch("/api/merge", {
            method: "POST",
            body: formData
        });

        const result = await response.json();

        // Display backend errors.
        if (!response.ok) {

            throw new Error(
                result.error || "Unable to merge songs."
            );

        }

        // Show the merged song.
        mergedAudio.src = result.download_url;

        downloadButton.href = result.download_url;

        resultSection.hidden = false;

        showStatus(
            `Songs merged successfully! Duration: ${formatDuration(result.duration)}`,
            false
        );

    } catch (error) {

        console.error("Song merger error:", error);

        showStatus(error.message, true);

    } finally {

        mergeButton.disabled = songs.length < 2;

        mergeButton.textContent = "🎵 Merge Songs";

    }

});


// --------------------------------------------------
// Show Status Messages
// --------------------------------------------------

function showStatus(message, isError) {

    statusMessage.textContent = message;

    statusMessage.classList.toggle("error-message", isError);

    statusMessage.classList.toggle("success-message", !isError);

}


// --------------------------------------------------
// Clear Previous Output
// --------------------------------------------------

function resetResult() {

    resultSection.hidden = true;

    mergedAudio.pause();

    mergedAudio.removeAttribute("src");

    mergedAudio.load();

    downloadButton.removeAttribute("href");

}


// --------------------------------------------------
// Format Duration
// --------------------------------------------------

function formatDuration(seconds) {

    const totalSeconds = Math.round(seconds);

    const minutes = Math.floor(totalSeconds / 60);

    const remainingSeconds = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;

}


// --------------------------------------------------
// Initialize the Page
// --------------------------------------------------

renderSongs();