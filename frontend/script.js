document.addEventListener("DOMContentLoaded", () => {
    console.log("JS loaded");
 
    const videoInput = document.getElementById("videoInput");
    const uploadBtn = document.getElementById("uploadBtn");
    const segmentBtn = document.getElementById("segmentBtn");
    const resultBox = document.getElementById("result");
 
    const videoPlayer = document.getElementById("videoPlayer");
    const videoSection = document.getElementById("videoSection");
 
    const startRange = document.getElementById("startRange");
    const endRange = document.getElementById("endRange");
    const startLabel = document.getElementById("startLabel");
    const endLabel = document.getElementById("endLabel");
 
    const timelineBar = document.getElementById("timelineBar");
    const timelineHighlight = document.getElementById("timelineHighlight");
    const leftHandle = document.getElementById("leftHandle");
    const rightHandle = document.getElementById("rightHandle");
    const timelineMarkerRow = document.getElementById("timelineMarkerRow");
 
    const addMarkerBtn = document.getElementById("addMarkerBtn");
    const removeMarkerBtn = document.getElementById("removeMarkerBtn");
    const markerType = document.getElementById("markerType");
    const markerPanel = document.getElementById("markerPanel");
 
    const markerNotes = document.getElementById("markerNotes");
    const saveNoteBtn = document.getElementById("saveNoteBtn");
 
    let uploadedFilename = null;
    let activeDrag = null;
    let dragOffset = 0;
    let shouldAutoStopSegmentEnd = false;
    let analysedSegments = [];
    let selectedMarkerIndex = null;
 
    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
 
    function updateTimelineHighlight(start, end, duration) {
        if (!duration || duration <= 0) return;
 
        const startPercent = (start / duration) * 100;
        const endPercent = (end / duration) * 100;
        timelineHighlight.style.left = `${startPercent}%`;
        timelineHighlight.style.width = `${endPercent - startPercent}%`;
 
        const timelineStart = document.getElementById("timelineStart");
        const timelineEnd = document.getElementById("timelineEnd");
 
        if (timelineStart) timelineStart.textContent = formatTime(start);
        if (timelineEnd) timelineEnd.textContent = formatTime(end);
 
        leftHandle.style.left = `${startPercent}%`;
        rightHandle.style.left = `${endPercent}%`;
    }
 
    function renderTimelineMarkers(duration) {
        console.log("Rendering markers:", analysedSegments, "duration:", duration);
 
        if (!timelineMarkerRow) return;
 
        timelineMarkerRow.innerHTML = "";
 
        analysedSegments.forEach((segment, index) => {
            const marker = document.createElement("div");
            marker.className = `timeline-marker ${segment.type || "marker-blue"}`;
            if (selectedMarkerIndex === index) {
                marker.classList.add("selected");
            }
 
            const leftPercent = (segment.start / duration) * 100;
            const widthPercent = (Math.max(segment.end - segment.start, duration * 0.01) / duration) * 100;
 
            marker.style.left = `${leftPercent}%`;
            marker.style.width = `${Math.max(widthPercent, 1)}%`;
            marker.title = `${formatTime(segment.start)} - ${formatTime(segment.end)} | ${segment.label || "Marker"}`;
 
            marker.addEventListener("click", () => {
                selectedMarkerIndex = index;
 
                startRange.value = segment.start;
                endRange.value = segment.end;
 
                startLabel.textContent = formatTime(segment.start);
                endLabel.textContent = formatTime(segment.end);
 
                updateTimelineHighlight(segment.start, segment.end, duration);
 
                videoPlayer.currentTime = segment.start;
                shouldAutoStopSegmentEnd = true;
                videoPlayer.pause();
 
                markerNotes.value = segment.note || "";
 
                renderTimelineMarkers(duration);
            });
 
            timelineMarkerRow.appendChild(marker);
        });
    }
 
    function renderAnalysis(analysis, previewFrames = []) {
        const confidencePercent = (analysis.confidence * 100).toFixed(0);
 
        let confidenceClass = "confidence-medium";
        if (confidencePercent < 40) {
            confidenceClass = "confidence-low";
        } else if (confidencePercent > 80) {
            confidenceClass = "confidence-high";
        }
 
        const confidenceHtml = `
            <div class="meta-pill ${confidenceClass}">
                Confidence: ${confidencePercent}%
            </div>
        `;
 
        const previewHtml = previewFrames.length
            ? `
            <details class="preview-card collapsible-card">
                <summary>Preview Frames</summary>
                <div class="preview-grid">
                    ${previewFrames.map(frame => `<img src="${frame}" alt="Preview frame" class="preview-frame">`).join("")}
                </div>
            </details>
            `
            : "";
 
        resultBox.innerHTML = `
            <div class="result-card">
                <p class="result-title">Defence Detected</p>
                <h1 class="defence-name">${analysis.defence}</h1>
                ${confidenceHtml}
                <p class="reasoning">
                    <strong>Reasoning:</strong><br>${analysis.explanation}
                </p>
            </div>
            ${previewHtml}
        `;
    }
 
    function showLoading(text = "Processing video... please wait") {
        resultBox.innerHTML = `
            <div class="loading-card">
                <div class="loading-card">
                    ⏳ ${text}
                </div>
            </div>
        `;
    }
 
    function showError(message) {
        resultBox.innerHTML = `
            <div class="error-card">
                ✗ ${message}
            </div>
        `;
    }
 
    videoPlayer.addEventListener("loadedmetadata", () => {
        const duration = videoPlayer.duration;
        startRange.max = duration;
        endRange.max = duration;
 
        startRange.value = 0;
        endRange.value = duration;
 
        startLabel.textContent = formatTime(0);
        endLabel.textContent = formatTime(duration);
 
        updateTimelineHighlight(0, duration, duration);
        renderTimelineMarkers(duration);
 
        markerPanel.style.display = "block";
    });
 
    videoPlayer.addEventListener("timeupdate", () => {
        const end = parseFloat(endRange.value);
 
        if (
            shouldAutoStopSegmentEnd &&
            !videoPlayer.paused &&
            videoPlayer.currentTime >= end
        ) {
            videoPlayer.pause();
            shouldAutoStopSegmentEnd = false;
        }
    });
 
    startRange.addEventListener("input", () => {
        let start = parseFloat(startRange.value);
        let end = parseFloat(endRange.value);
 
        if (start > end) {
            start = end;
            startRange.value = start;
        }
 
        startLabel.textContent = formatTime(start);
        updateTimelineHighlight(start, end, videoPlayer.duration);
    });
 
    endRange.addEventListener("input", () => {
        let start = parseFloat(startRange.value);
        let end = parseFloat(endRange.value);
 
        if (end < start) {
            end = start;
            endRange.value = start;
        }
 
        endLabel.textContent = formatTime(end);
        updateTimelineHighlight(start, end, videoPlayer.duration);
    });
 
    function getTimeFromMouse(event) {
        const rect = timelineBar.getBoundingClientRect();
        const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
        const percent = x / rect.width;
        return percent * videoPlayer.duration;
    }
 
    leftHandle.addEventListener("mousedown", () => {
        activeDrag = "left";
    });
 
    rightHandle.addEventListener("mousedown", () => {
        activeDrag = "right";
    });
 
    timelineHighlight.addEventListener("mousedown", (event) => {
        activeDrag = "segment";
 
        const rect = timelineBar.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const barWidth = rect.width;
 
        const start = parseFloat(startRange.value);
        const duration = videoPlayer.duration;
        const startPx = (start / duration) * barWidth;
 
        dragOffset = clickX - startPx;
    });
 
    document.addEventListener("mouseup", () => {
        activeDrag = null;
    });
 
    document.addEventListener("mousemove", (event) => {
        if (!activeDrag) return;
 
        const rect = timelineBar.getBoundingClientRect();
        const barWidth = rect.width;
        if (barWidth <= 0) return;
 
        const x = Math.min(Math.max(event.clientX - rect.left, 0), barWidth);
        const time = (x / barWidth) * videoPlayer.duration;
 
        let start = parseFloat(startRange.value);
        let end = parseFloat(endRange.value);
 
        if (activeDrag === "left") {
            start = Math.min(time, end);
        }
 
        if (activeDrag === "right") {
            end = Math.max(time, start);
        }
 
        if (activeDrag === "segment") {
            const segmentLength = end - start;
 
            let newStartPx = x - dragOffset;
            newStartPx = Math.max(
                0,
                Math.min(newStartPx, barWidth - (segmentLength / videoPlayer.duration) * barWidth)
            );
 
            const newStart = (newStartPx / barWidth) * videoPlayer.duration;
            const newEnd = newStart + segmentLength;
 
            start = newStart;
            end = newEnd;
        }
 
        startRange.value = start;
        endRange.value = end;
 
        startLabel.textContent = formatTime(start);
        endLabel.textContent = formatTime(end);
 
        updateTimelineHighlight(start, end, videoPlayer.duration);
    });
 
    // ── UPLOAD ──────────────────────────────────────────────────────────────
    uploadBtn.addEventListener("click", async () => {
        const file = videoInput.files[0];
        if (!file) {
            showError("Please select a video file.");
            return;
        }
 
        const formData = new FormData();
        formData.append("video", file);
 
        showLoading("Uploading and analysing...");
 
        try {
            const response = await fetch("https://basketball-defence-analyser.onrender.com/upload", {
                method: "POST",
                body: formData,
            });
 
            const data = await response.json();
 
            if (!response.ok) {
                throw new Error(data.error || "Upload failed.");
            }
 
            uploadedFilename = data.filename;
            videoPlayer.src = data.video_url;
            videoSection.style.display = "block";
            markerPanel.style.display = "block";

            // Auto-analyse the full video immediately
            showLoading("Analysing full video...");

            try {
                const analyseResponse = await fetch("https://basketball-defence-analyser.onrender.com/analyse-segment", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        filename: uploadedFilename,
                        start_time: 0,
                        end_time: 9999, // backend will clamp to video length
                    }),
                });

                const analyseData = await analyseResponse.json();

                if (!analyseResponse.ok) {
                    throw new Error(analyseData.error || "Analysis failed.");
                }

                renderAnalysis(analyseData.analysis, analyseData.preview_frames || []);
            } catch (analyseError) {
                console.error(analyseError);
                showError(analyseError.message);
            }
        } catch (error) {
            console.error(error);
            showError(error.message);
        }
    });
 
    // ── ANALYSE SEGMENT ─────────────────────────────────────────────────────
    segmentBtn.addEventListener("click", async () => {
        if (!uploadedFilename) {
            showError("Please upload a video first.");
            return;
        }
 
        const start_time = parseFloat(startRange.value);
        const end_time = parseFloat(endRange.value);
 
        videoPlayer.currentTime = start_time;
        shouldAutoStopSegmentEnd = true;
        videoPlayer.play();
 
        showLoading(`Analysing segment (${formatTime(start_time)} – ${formatTime(end_time)})…`);
 
        try {
            const response = await fetch("https://basketball-defence-analyser.onrender.com/analyse-segment", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    filename: uploadedFilename,
                    start_time,
                    end_time,
                }),
            });
 
            const data = await response.json();
 
            if (!response.ok) {
                throw new Error(data.error || "Segment analysis failed.");
            }
 
            renderAnalysis(data.analysis, data.preview_frames || []);
        } catch (error) {
            console.error(error);
            showError(error.message);
        }
    });
 
    // ── MARKERS ──────────────────────────────────────────────────────────────
    addMarkerBtn.addEventListener("click", () => {
        console.log("Add Marker clicked");
 
        if (!videoPlayer.duration) {
            showError("Load a video first.");
            return;
        }
 
        const start = parseFloat(startRange.value);
        const end = parseFloat(endRange.value);
 
        console.log("Start:", start, "End:", end);
 
        if (end <= start) {
            showError("End time must be greater than start time.");
            return;
        }
 
        analysedSegments.push({
            start,
            end,
            type: markerType.value,
            label: markerType.options[markerType.selectedIndex].text,
            note: "" // ← important
        });
 
        selectedMarkerIndex = analysedSegments.length - 1;
 
        console.log("Markers array:", analysedSegments);
 
        renderTimelineMarkers(videoPlayer.duration);
    });
 
    removeMarkerBtn.addEventListener("click", () => {
        if (selectedMarkerIndex === null) {
            showError("Select a marker first.");
            return;
        }
 
        analysedSegments.splice(selectedMarkerIndex, 1);
        selectedMarkerIndex = null;
 
        renderTimelineMarkers(videoPlayer.duration);
    });
 
    saveNoteBtn.addEventListener("click", () => {
        if (selectedMarkerIndex === null) {
            showError("Select a marker first.");
            return;
        }
 
        analysedSegments[selectedMarkerIndex].note = markerNotes.value;
    });
});