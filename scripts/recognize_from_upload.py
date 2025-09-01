import insightface
import numpy as np
import faiss
import sys
import pickle
import os
import cv2
import contextlib
import json

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

print("[PY] --- Face Recognition Script Started ---")

# === Paths ===
BASE_DIR = os.path.dirname(os.path.abspath(__file__))        # scripts/
FAISS_DIR = os.path.join(BASE_DIR, "faiss_data")             # scripts/faiss_data
INDEX_PATH = os.path.join(FAISS_DIR, "face_index.faiss")
IDS_PATH = os.path.join(FAISS_DIR, "rollnos.pkl")

print(f"[PY] BASE_DIR={BASE_DIR}")
print(f"[PY] INDEX_PATH={INDEX_PATH}")
print(f"[PY] IDS_PATH={IDS_PATH}")

# === Load Index & IDs ===
if not os.path.exists(INDEX_PATH) or not os.path.exists(IDS_PATH):
    print("[PY] ERROR: Missing FAISS index or rollnos.pkl")
    print(json.dumps({"recognizedId": "Unknown", "distance": None, "status": "error", "reason": "Missing index"}))
    sys.exit(1)

index = faiss.read_index(INDEX_PATH)
with open(IDS_PATH, "rb") as f:
    student_ids = pickle.load(f)

print(f"[PY] Loaded FAISS index with {index.ntotal} vectors, {len(student_ids)} IDs")

if index.ntotal != len(student_ids):
    print("[PY] ERROR: Index count mismatch")
    print(json.dumps({"recognizedId": "Unknown", "distance": None, "status": "error", "reason": "Index mismatch"}))
    sys.exit(1)

# === Input Handling ===
if len(sys.argv) < 2:
    print("[PY] ERROR: No image path argument")
    print(json.dumps({"recognizedId": "Unknown", "distance": None, "status": "error", "reason": "No image path"}))
    sys.exit(1)

image_path = sys.argv[1]
target_roll = sys.argv[2] if len(sys.argv) > 2 else None
print(f"[PY] Input image={image_path}, Target Roll={target_roll}")

if not os.path.exists(image_path):
    print("[PY] ERROR: Image path does not exist")
    print(json.dumps({"recognizedId": "Unknown", "distance": None, "status": "error", "reason": "Image not found"}))
    sys.exit(1)

# === Load Face Model ===
print("[PY] Loading InsightFace model (buffalo_l)...")
with suppress_stdout_stderr():
    model = insightface.app.FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
    model.prepare(ctx_id=0)
print("[PY] Model loaded successfully")

# === Load Image ===
img = cv2.imread(image_path)
if img is None:
    print("[PY] ERROR: cv2 failed to read image")
    print(json.dumps({"recognizedId": "Unknown", "distance": None, "status": "error", "reason": "cv2 load fail"}))
    sys.exit(1)

print(f"[PY] Image shape={img.shape}")

img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
faces = model.get(img_rgb)

print(f"[PY] Faces detected: {len(faces)}")

if not faces:
    print("[PY] No faces detected → unmatched")
    print(json.dumps({"recognizedId": "Unknown", "distance": None, "status": "unmatched"}))
    sys.exit(0)

# === Extract Largest Face ===
best_face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
embedding = best_face.embedding
embedding = embedding / np.linalg.norm(embedding)
query_vector = np.array([embedding], dtype=np.float32)

print(f"[PY] Embedding shape={query_vector.shape}")

if query_vector.shape[1] != index.d:
    print("[PY] ERROR: Embedding shape mismatch with FAISS index")
    print(json.dumps({"recognizedId": "Unknown", "distance": None, "status": "error", "reason": "Embedding mismatch"}))
    sys.exit(1)

# === Search FAISS ===
D, I = index.search(query_vector, k=3)
distances = D[0]
indices = I[0]

print(f"[PY] FAISS distances={distances.tolist()}, indices={indices.tolist()}")

threshold = 1.3  # slightly looser threshold

if len(indices) == 0 or len(distances) == 0 or distances[0] > threshold:
    print("[PY] No good match → unmatched")
    print(json.dumps({
        "recognizedId": "Unknown",
        "distance": float(distances[0]) if len(distances) else None,
        "status": "unmatched"
    }))
else:
    matched_id = student_ids[indices[0]]
    status = "matched"
    if target_roll and matched_id != target_roll:
        status = "mismatch"

    print(f"[PY] MATCH FOUND: matched_id={matched_id}, distance={distances[0]}, status={status}")
    print(json.dumps({
        "recognizedId": matched_id,
        "distance": float(distances[0]),
        "status": status
    }))
