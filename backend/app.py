from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS, cross_origin
import os
import cv2
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "https://basketball-defence-analyser-1.onrender.com"}})


UPLOAD_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads"))
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

FRAMES_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frames"))
os.makedirs(FRAMES_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {"mp4", "mov", "avi", "mkv"}

def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

def extract_frames(video_path: str, every_n_frames: int = 10) -> str:
    """
    Extract frames from a video every N frames.
    Returns the folder path where frames were saved.
    """
    # create a unique output folder per upload
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = os.path.join(FRAMES_FOLDER, f"run_{stamp}")
    os.makedirs(out_dir, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Could not open video file")

    frame_idx = 0
    saved = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % every_n_frames == 0:
            frame_file = os.path.join(out_dir, f"frame_{frame_idx:06d}.jpg")
            cv2.imwrite(frame_file, frame)
            saved += 1

        frame_idx += 1

    cap.release()
    return out_dir, saved

def simple_defence_analysis(frames_dir: str, sample_limit: int = 30) -> dict:
    """
    Very simple heuristic:
    - Measures frame-to-frame motion intensity.
    - Lower variance suggests zone-like behaviour.
    - Higher variance suggests man-to-man.
    """
    import glob
    import numpy as np

    frame_files = sorted(glob.glob(os.path.join(frames_dir, "*.jpg")))[:sample_limit]

    if len(frame_files) < 2:
        return {
            "defence": "Unknown",
            "confidence": 0.0,
            "explanation": "Not enough frames to analyse."
        }

    motion_scores = []
    prev_gray = None

    for f in frame_files:
        img = cv2.imread(f)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        if prev_gray is not None:
            diff = cv2.absdiff(prev_gray, gray)
            score = np.mean(diff)
            motion_scores.append(score)

        prev_gray = gray

    avg_motion = float(np.mean(motion_scores))

    threshold = 12
    distance = abs(avg_motion - threshold)
    confidence = min(0.95, max(0.50, 0.50 + (distance / 20)))

    if avg_motion < threshold:
        defence = "Zone Defence"
        explanation = (
            "Lower average off-ball motion detected. "
            "Defenders appear to maintain spatial areas rather than follow individuals."
        )
    else:
        defence = "Man-to-Man Defence"
        explanation = (
            "Higher frame-to-frame motion detected. "
            "Defenders appear to track individual attackers more closely."
        )

    return {
        "defence": defence,
        "confidence": round(confidence, 2),
        "avg_motion_score": round(avg_motion, 2),
        "explanation": explanation
    }

def extract_frames_from_segment(video_path: str, start_time: float, end_time: float, every_n_frames: int = 10) -> tuple[str, int]:
    """
    Extract frames only from a selected time segment.
    Returns (output_folder, frames_saved_count).
    """
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = os.path.join(FRAMES_FOLDER, f"segment_{stamp}")
    os.makedirs(out_dir, exist_ok=True)

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video file: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if fps <= 0:
        fps = 30

    start_frame = int(start_time * fps)
    end_frame = int(end_time * fps)

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    frame_idx = start_frame
    saved = 0

    while frame_idx <= end_frame:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % every_n_frames == 0:
            frame_file = os.path.join(out_dir, f"frame_{frame_idx:06d}.jpg")
            cv2.imwrite(frame_file, frame)
            saved += 1

        frame_idx += 1

    cap.release()
    return out_dir, saved

def get_preview_frames(frames_dir: str, max_frames: int = 3) -> list[str]:
    """
    Return up to max_frames preview image URLs from a frame directory.
    """
    frame_files = sorted([
        f for f in os.listdir(frames_dir)
        if f.lower().endswith(".jpg")
    ])

    if not frame_files:
        return []

    # Pick evenly spaced preview frames
    if len(frame_files) <= max_frames:
        selected = frame_files
    else:
        step = max(1, len(frame_files) // max_frames)
        selected = [frame_files[i] for i in range(0, len(frame_files), step)[:max_frames]]

    folder_name = os.path.basename(frames_dir)

    return [
        f"http://127.0.0.1:5000/frames/{folder_name}/{fname}"
        for fname in selected
    ]

@app.route("/uploads/<path:filename>")
def serve_uploaded_video(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

@app.route("/")
def home():
    return "Backend is running successfully!"

@app.route("/upload", methods=["POST"])
@cross_origin(origin="https://basketball-defence-analyser-1.onrender.com")
def upload_video():
    if "video" not in request.files:
        return jsonify({"error": "No file part named 'video' found"}), 400

    file = request.files["video"]

    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400

    try:
        filename = secure_filename(file.filename)
        save_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(save_path)

        frames_dir, frames_count = extract_frames(save_path, every_n_frames=10)
        analysis = simple_defence_analysis(frames_dir)

        return jsonify({
            "message": "Upload successful",
            "filename": filename,
            "saved_to": save_path,
            "video_url": f"http://127.0.0.1:5000/uploads/{filename}",
            "frames_saved_to": frames_dir,
            "frames_saved_count": frames_count,
            "analysis": analysis
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/analyze-segment", methods=["POST"])
@cross_origin(origin="https://basketball-defence-analyser-1.onrender.com")
def analyze_segment():
    data = request.get_json()

    filename = data.get("filename")
    start_time = float(data.get("start_time", 0))
    end_time = float(data.get("end_time", 0))

    if not filename:
        return jsonify({"error": "Filename is required"}), 400

    video_path = os.path.join(UPLOAD_FOLDER, filename)

    if not os.path.exists(video_path):
        return jsonify({"error": "Video file not found"}), 404

    try:
        frames_dir, frames_count = extract_frames_from_segment(
            video_path,
            start_time,
            end_time,
            every_n_frames=10
        )

        analysis = simple_defence_analysis(frames_dir)
        preview_frames = get_preview_frames(frames_dir)

        return jsonify({
            "message": "Segment analysis successful",
            "filename": filename,
            "segment_start": start_time,
            "segment_end": end_time,
            "frames_saved_to": frames_dir,
            "frames_saved_count": frames_count,
            "preview_frames": preview_frames,
            "analysis": analysis
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/frames/<path:subpath>")
def serve_frame(subpath):
    return send_from_directory(FRAMES_FOLDER, subpath)
    
if __name__ == "__main__":
    app.run(debug=True)
