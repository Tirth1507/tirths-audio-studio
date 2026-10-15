
"use strict";

// --------------------------------------------------
// Get HTML Elements
// --------------------------------------------------

const songFiles = document.getElementById("songFiles");
const chooseSongsButton = document.getElementById("chooseSongsButton");

const songList = document.getElementById("songList");
const processSection = document.getElementById("processSection");
const trimAllButton = document.getElementById("trimAllButton");

const statusMessage = document.getElementById("statusMessage");

const resultSection = document.getElementById("resultSection");
const resultList = document.getElementById("resultList");

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_SONGS = 10;

const ALLOWED_EXTENSIONS = [
    "mp3", "wav", "ogg", "m4a", "aac", "flac", "mp4"
];

// Each item stores the selected file and its preview information.
let songs = [];
let isProcessing = false;


// --------------------------------------------------
// Format Seconds as MM:SS
// --------------------------------------------------

function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds));

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return (
        String(minutes).padStart(2, "0") +
        ":" +
        String(remainingSeconds).padStart(2, "0")
    );
}


// --------------------------------------------------
// Convert Seconds, MM:SS, or HH:MM:SS to Seconds
// --------------------------------------------------

function parseTime(value) {
    value = value.trim();

    // Allow seconds such as 75 or 75.5.
    if (/^\d+(?:\.\d+)?$/.test(value)) {
        return Number(value);
    }

    const parts = value.split(":");

    // Only MM:SS or HH:MM:SS is supported.
    if (
        parts.length < 2 ||
        parts.length > 3 ||
        !parts.every(part => /^\d+(?:\.\d+)?$/.test(part))
    ) {
        return NaN;
    }

    // Seconds must be below 60.
    if (Number(parts[parts.length - 1]) >= 60) {
        return NaN;
    }

    if (parts.length === 2) {
        return Number(parts[0]) * 60 + Number(parts[1]);
    }

    // In HH:MM:SS, minutes must be below 60.
    if (Number(parts[1]) >= 60) {
        return NaN;
    }

    return (
        Number(parts[0]) * 3600 +
        Number(parts[1]) * 60 +
        Number(parts[2])
    );
}


// --------------------------------------------------
// Show a Status Message
// --------------------------------------------------

function showStatus(message, isError = false) {
    statusMessage.textContent = message;

    statusMessage.style.color = isError ? "#dc3545" : "";
}


// --------------------------------------------------
// Create a Label Element
// --------------------------------------------------

function createLabel(text, htmlFor) {
    const label = document.createElement("label");

    label.className = "form-label";
    label.textContent = text;
    label.htmlFor = htmlFor;

    return label;
}


// --------------------------------------------------
// Create a Time Input
// --------------------------------------------------

function createTimeInput(id, value, placeholder) {
    const input = document.createElement("input");

    input.type = "text";
    input.id = id;
    input.className = "form-control custom-input";
    input.value = value;
    input.placeholder = placeholder;
    input.autocomplete = "off";

    return input;
}


// --------------------------------------------------
// Stop a Song's Selected Portion Preview
// --------------------------------------------------

function stopSongPreview(song) {
    song.previewActive = false;

    if (song.previewFrame !== null) {
        cancelAnimationFrame(song.previewFrame);
        song.previewFrame = null;
    }

    song.media.pause();
}


// --------------------------------------------------
// Stop Every Preview
// --------------------------------------------------

function stopAllPreviews() {
    songs.forEach(song => stopSongPreview(song));
}


// --------------------------------------------------
// Get and Validate a Song's Time Range
// --------------------------------------------------

function getSongTimeRange(song) {
    const start = parseTime(song.startInput.value);
    const end = parseTime(song.endInput.value);

    if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end <= start ||
        end > song.duration
    ) {
        throw new Error(
            `Please enter a valid start and end time for "${song.file.name}".`
        );
    }

    return { start, end };
}


// --------------------------------------------------
// Update Selected Duration
// --------------------------------------------------

function updateSelectedDuration(song) {
    try {
        const range = getSongTimeRange(song);

        song.selectedDuration.textContent =
            formatTime(range.end - range.start);

        song.selectedDuration.style.color = "";

    } catch (error) {
        song.selectedDuration.textContent = "--:--";
        song.selectedDuration.style.color = "#dc3545";
    }
}


// --------------------------------------------------
// Preview Only the Selected Portion
// --------------------------------------------------

async function previewSelectedPortion(song) {
    try {
        const range = getSongTimeRange(song);

        stopSongPreview(song);

        // Start at the selected beginning.
        song.media.currentTime = range.start;
        song.previewEnd = range.end;
        song.previewActive = true;

        await song.media.play();

        // Stop playback at the selected end.
        function checkPreviewEnd() {
            if (!song.previewActive) {
                return;
            }

            if (song.media.currentTime >= song.previewEnd) {
                stopSongPreview(song);
                return;
            }

            song.previewFrame = requestAnimationFrame(checkPreviewEnd);
        }

        checkPreviewEnd();

    } catch (error) {
        stopSongPreview(song);

        showStatus(
            error.message || "Unable to play this selected portion.",
            true
        );
    }
}


// --------------------------------------------------
// Build One Song's Editing Card
// --------------------------------------------------

function createSongCard(file, index) {
    const song = {
        file: file,
        duration: 0,
        objectURL: URL.createObjectURL(file),
        media: null,
        startInput: null,
        endInput: null,
        selectedDuration: null,
        previewEnd: 0,
        previewActive: false,
        previewFrame: null,
        ready: false,
        card: null
    };

    // Main card.
    const card = document.createElement("div");
    card.className = "editor-card mb-4";
    song.card = card;

    // Song heading.
    const heading = document.createElement("h5");
    heading.className = "section-heading";
    heading.textContent = `Song ${index + 1}: ${file.name}`;

    card.appendChild(heading);

    const durationText = document.createElement("p");
    durationText.className = "text-muted-custom";
    durationText.textContent = "Loading song duration...";

    card.appendChild(durationText);

    // Use a video element for MP4 so its metadata and audio can be previewed.
    const extension = file.name.split(".").pop().toLowerCase();

    const media = document.createElement(
        extension === "mp4" ? "video" : "audio"
    );

    media.controls = true;
    media.preload = "metadata";
    media.className = "audio-player";
    media.src = song.objectURL;

    if (extension === "mp4") {
        media.style.width = "100%";
        media.style.maxHeight = "260px";
    }

    song.media = media;
    card.appendChild(media);

    // Start and end controls.
    const timeRow = document.createElement("div");
    timeRow.className = "row g-3 mt-2";

    const startColumn = document.createElement("div");
    startColumn.className = "col-md-6";

    const startId = `startTime_${index}`;
    const startLabel = createLabel("Start Time (MM:SS)", startId);
    const startInput = createTimeInput(startId, "00:00", "01:15");

    startColumn.appendChild(startLabel);
    startColumn.appendChild(startInput);

    const endColumn = document.createElement("div");
    endColumn.className = "col-md-6";

    const endId = `endTime_${index}`;
    const endLabel = createLabel("End Time (MM:SS)", endId);
    const endInput = createTimeInput(endId, "", "02:30");

    endColumn.appendChild(endLabel);
    endColumn.appendChild(endInput);

    timeRow.appendChild(startColumn);
    timeRow.appendChild(endColumn);

    card.appendChild(timeRow);

    song.startInput = startInput;
    song.endInput = endInput;

    // Selected duration summary.
    const summary = document.createElement("div");
    summary.className = "selection-summary mt-3";

    const summaryLabel = document.createElement("span");
    summaryLabel.textContent = "Selected Duration";

    const selectedDuration = document.createElement("strong");
    selectedDuration.textContent = "--:--";

    summary.appendChild(summaryLabel);
    summary.appendChild(selectedDuration);

    song.selectedDuration = selectedDuration;
    card.appendChild(summary);

    // Preview and stop buttons.
    const buttonGroup = document.createElement("div");
    buttonGroup.className = "button-group mt-3";

    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "btn btn-outline-custom";
    previewButton.textContent = "▶ Preview Selected Portion";
    previewButton.disabled = true;

    previewButton.addEventListener("click", () => {
        previewSelectedPortion(song);
    });

    const stopButton = document.createElement("button");
    stopButton.type = "button";
    stopButton.className = "btn btn-outline-custom";
    stopButton.textContent = "■ Stop Preview";

    stopButton.addEventListener("click", () => {
        stopSongPreview(song);
    });

    buttonGroup.appendChild(previewButton);
    buttonGroup.appendChild(stopButton);

    card.appendChild(buttonGroup);

    // Listen for edits to the selected times.
    startInput.addEventListener("input", () => {
        stopSongPreview(song);
        updateSelectedDuration(song);
    });

    endInput.addEventListener("input", () => {
        stopSongPreview(song);
        updateSelectedDuration(song);
    });

    // Wait for the browser to read the song's duration.
    media.addEventListener("loadedmetadata", () => {
        if (!Number.isFinite(media.duration) || media.duration <= 0) {
            durationText.textContent =
                "Unable to determine the song duration.";

            return;
        }

        song.duration = media.duration;
        song.ready = true;

        durationText.textContent =
            `Total Duration: ${formatTime(song.duration)}`;

        startInput.value = "00:00";
        endInput.value = formatTime(song.duration);

        previewButton.disabled = false;

        updateSelectedDuration(song);
    });

    media.addEventListener("error", () => {
        durationText.textContent =
            "Your browser cannot preview this file. " +
            "Try another format or browser.";

        // The backend may support a format that this browser cannot preview.
        song.ready = false;
    });

    // Also stop if playback reaches the selected end.
    media.addEventListener("timeupdate", () => {
        if (
            song.previewActive &&
            media.currentTime >= song.previewEnd
        ) {
            stopSongPreview(song);
        }
    });

    return song;
}


// --------------------------------------------------
// Handle Multiple File Selection
// --------------------------------------------------

chooseSongsButton.addEventListener("click", () => {
    songFiles.click();
});

songFiles.addEventListener("change", () => {
    stopAllPreviews();

    // Release old browser preview URLs.
    songs.forEach(song => URL.revokeObjectURL(song.objectURL));

    songs = [];
    songList.replaceChildren();
    resultList.replaceChildren();

    resultSection.classList.add("d-none");
    processSection.classList.add("d-none");

    showStatus("");

    const selectedFiles = Array.from(songFiles.files);

    if (selectedFiles.length === 0) {
        return;
    }

    if (selectedFiles.length > MAX_SONGS) {
        showStatus(
            `Please select no more than ${MAX_SONGS} songs.`,
            true
        );

        songFiles.value = "";
        return;
    }

    // Validate the extension and file size before creating cards.
    for (const file of selectedFiles) {
        const extension = file.name.split(".").pop().toLowerCase();

        if (!ALLOWED_EXTENSIONS.includes(extension)) {
            showStatus(
                `Unsupported file format: ${file.name}`,
                true
            );

            songFiles.value = "";
            return;
        }

        if (file.size > MAX_FILE_SIZE) {
            showStatus(
                `${file.name} is larger than 50 MB.`,
                true
            );

            songFiles.value = "";
            return;
        }
    }

    const totalSize = selectedFiles.reduce(
        (total, file) => total + file.size,
        0
    );

    if (totalSize > MAX_FILE_SIZE) {
        showStatus(
            "The combined file size exceeds 50 MB. " +
            "Select fewer or smaller songs.",
            true
        );

        songFiles.value = "";
        return;
    }

    // Build a separate editor for each song.
    selectedFiles.forEach((file, index) => {
        const song = createSongCard(file, index);

        songs.push(song);
        songList.appendChild(song.card);
    });

    processSection.classList.remove("d-none");

    showStatus(
        `${songs.length} song(s) selected. Set the time range for each song.`
    );
});


// --------------------------------------------------
// Trim All Selected Songs
// --------------------------------------------------

trimAllButton.addEventListener("click", async () => {
    if (isProcessing) {
        return;
    }

    if (songs.length === 0) {
        showStatus("Please select at least one song.", true);
        return;
    }

    stopAllPreviews();

    // Validate every song before sending anything to Flask.
    const timeRanges = [];

    try {
        for (const song of songs) {
            if (!song.ready || !Number.isFinite(song.duration)) {
                throw new Error(
                    `The duration of "${song.file.name}" is not ready. ` +
                    "Wait for it to load before trimming."
                );
            }

            timeRanges.push(getSongTimeRange(song));
        }
    } catch (error) {
        showStatus(error.message, true);
        return;
    }

    const formData = new FormData();

    // The backend reads all files using request.files.getlist("songs").
    songs.forEach((song, index) => {
        formData.append("songs", song.file);
        formData.append(`start_${index}`, timeRanges[index].start);
        formData.append(`end_${index}`, timeRanges[index].end);
    });

    isProcessing = true;
    trimAllButton.disabled = true;
    chooseSongsButton.disabled = true;

    resultSection.classList.add("d-none");
    resultList.replaceChildren();

    showStatus("Processing your selected songs. Please wait...");

    try {
        const response = await fetch("/api/trim-multiple", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Unable to trim the selected songs."
            );
        }

        // Create a result card for each successfully trimmed song.
        data.clips.forEach(clip => {
            const card = document.createElement("div");
            card.className = "editor-card mb-3";

            const heading = document.createElement("h5");
            heading.className = "section-heading";
            heading.textContent =
                `Song ${clip.song_number}: ${clip.original_name}`;

            const duration = document.createElement("p");
            duration.className = "text-muted-custom";
            duration.textContent =
                `Trimmed duration: ${formatTime(clip.duration)}`;

            const audio = document.createElement("audio");
            audio.controls = true;
            audio.preload = "metadata";
            audio.className = "audio-player";
            audio.src = clip.download_url;

            const download = document.createElement("a");
            download.className = "btn btn-success w-100 mt-3";
            download.href = clip.download_url;
            download.download = `tirths_trimmed_song_${clip.song_number}.mp3`;
            download.textContent = "⬇ Download Trimmed Song";

            card.appendChild(heading);
            card.appendChild(duration);
            card.appendChild(audio);
            card.appendChild(download);

            resultList.appendChild(card);
        });

        resultSection.classList.remove("d-none");

        showStatus(data.message || "All songs trimmed successfully!");

    } catch (error) {
        showStatus(error.message, true);

    } finally {
        isProcessing = false;
        trimAllButton.disabled = false;
        chooseSongsButton.disabled = false;
    }
});


// --------------------------------------------------
// Clean Up Preview URLs When Leaving the Page
// --------------------------------------------------

window.addEventListener("beforeunload", () => {
    stopAllPreviews();

    songs.forEach(song => {
        URL.revokeObjectURL(song.objectURL);
    });
});
