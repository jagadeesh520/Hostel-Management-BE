import insightface
import numpy as np
import faiss
import sys
import pickle
import os
import cv2
import contextlib
import json
import time

# === Global variables for pre-loaded models ===
face_model = None
faiss_index = None
student_ids = None


# === Logging helper (stderr only) ===
def log(msg: str):
    sys.stderr.write(f"[PY] {msg}\n")
    sys.stderr.flush()


# === Suppress insightface logs ===
@contextlib.contextmanager
def suppress_stdout_stderr():
    with open(os.devnull, 'w') as devnull:
        old_stdout, old_stderr = sys.stdout, sys.stderr
        sys.stdout = sys.stderr = devnull
        try:
            yield
        finally:
            sys.stdout, sys.stderr = old_stdout, old_stderr


# === Pre-load models (call this once at startup) ===
def load_models():
    global face_model, faiss_index, student_ids

    log("--- Pre-loading Models ---")

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    FAISS_DIR = os.path.join(BASE_DIR, "faiss_data")
    INDEX_PATH = os.path.join(FAISS_DIR, "face_index.faiss")
    IDS_PATH = os.path.join(FAISS_DIR, "rollnos.pkl")

    # Load FAISS index and IDs
    if not os.path.exists(INDEX_PATH) or not os.path.exists(IDS_PATH):
        log("ERROR: Missing FAISS index or rollnos.pkl")
        return False

    try:
        log("Loading FAISS index...")
        faiss_index = faiss.read_index(INDEX_PATH)
        with open(IDS_PATH, "rb") as f:
            student_ids = pickle.load(f)
        log(f"Loaded FAISS index with {faiss_index.ntotal} vectors, {len(student_ids)} IDs")

        if faiss_index.ntotal != len(student_ids):
            log("ERROR: Index count mismatch")
            return False

        # Load InsightFace model
        log("Loading InsightFace model (buffalo_l)...")
        start_time = time.time()
        with suppress_stdout_stderr():
            face_model = insightface.app.FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
            face_model.prepare(ctx_id=0)
        load_time = time.time() - start_time
        log(f"Model loaded successfully in {load_time:.2f} seconds")

        return True

    except Exception as e:
        log(f"ERROR loading models: {str(e)}")
        return False


# === Image pre-processing ===
def preprocess_image(image_path, max_size=1024):
    """Resize large images to improve processing speed"""
    img = cv2.imread(image_path)
    if img is None:
        return None

    height, width = img.shape[:2]

    # Only resize if image is larger than max_size
    if max(height, width) > max_size:
        scale = max_size / max(height, width)
        new_width = int(width * scale)
        new_height = int(height * scale)
        img = cv2.resize(img, (new_width, new_height))
        log(f"Resized image from ({width}x{height}) to ({new_width}x{new_height})")

    return img


# === Main recognition function ===
def recognize_face(image_path, target_roll=None):
    global face_model, faiss_index, student_ids

    if face_model is None or faiss_index is None:
        log("ERROR: Models not loaded")
        return {"recognizedId": "Unknown", "distance": None, "status": "error", "reason": "Models not loaded"}

    if not os.path.exists(image_path):
        log("ERROR: Image path does not exist")
        return {"recognizedId": "Unknown", "distance": None, "status": "error", "reason": "Image not found"}

    # Pre-process image (resize if too large)
    img = preprocess_image(image_path, max_size=1024)
    if img is None:
        log("ERROR: Failed to load image")
        return {"recognizedId": "Unknown", "distance": None, "status": "error", "reason": "Image load failed"}

    log(f"Image shape={img.shape}")

    # Convert to RGB and detect faces
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    start_time = time.time()
    faces = face_model.get(img_rgb)
    detection_time = time.time() - start_time
    log(f"Faces detected: {len(faces)} in {detection_time:.2f}s")

    if not faces:
        log("No faces detected → unmatched")
        return {"recognizedId": "Unknown", "distance": None, "status": "unmatched"}

    # Extract largest face
    best_face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
    embedding = best_face.embedding
    embedding = embedding / np.linalg.norm(embedding)
    query_vector = np.array([embedding], dtype=np.float32)

    log(f"Embedding shape={query_vector.shape}")

    if query_vector.shape[1] != faiss_index.d:
        log("ERROR: Embedding shape mismatch with FAISS index")
        return {"recognizedId": "Unknown", "distance": None, "status": "error", "reason": "Embedding mismatch"}

    # Search FAISS
    start_time = time.time()
    D, I = faiss_index.search(query_vector, k=3)
    search_time = time.time() - start_time
    distances = D[0]
    indices = I[0]

    log(f"FAISS search completed in {search_time:.2f}s")
    log(f"FAISS distances={distances.tolist()}, indices={indices.tolist()}")

    threshold = 1.3

    if len(indices) == 0 or len(distances) == 0 or distances[0] > threshold:
        log("No good match → unmatched")
        return {
            "recognizedId": "Unknown",
            "distance": float(distances[0]) if len(distances) else None,
            "status": "unmatched"
        }
    else:
        matched_id = student_ids[indices[0]]
        status = "matched"
        if target_roll and matched_id != target_roll:
            status = "mismatch"

        log(f"MATCH FOUND: matched_id={matched_id}, distance={distances[0]}, status={status}")
        return {
            "recognizedId": matched_id,
            "distance": float(distances[0]),
            "status": status
        }


# === Main execution ===
if __name__ == "__main__":
    log("--- Face Recognition Script Started ---")

    # Pre-load models (this happens only once)
    if face_model is None:
        if not load_models():
            log("Failed to load models, exiting")
            print(json.dumps(
                {"recognizedId": "Unknown", "distance": None, "status": "error", "reason": "Model load failed"}))
            sys.exit(1)

    # Handle input arguments
    if len(sys.argv) < 2:
        log("ERROR: No image path argument")
        print(json.dumps({"recognizedId": "Unknown", "distance": None, "status": "error", "reason": "No image path"}))
        sys.exit(1)

    image_path = sys.argv[1]
    target_roll = sys.argv[2] if len(sys.argv) > 2 else None
    log(f"Input image={image_path}, Target Roll={target_roll}")

    # Perform recognition
    start_time = time.time()
    result = recognize_face(image_path, target_roll)
    total_time = time.time() - start_time

    log(f"Total recognition time: {total_time:.2f} seconds")
    print(json.dumps(result))