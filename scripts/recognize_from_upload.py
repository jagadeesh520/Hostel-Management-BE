import insightface
import numpy as np
import faiss
import sys
import pickle
import os
import cv2
import contextlib

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

# === Paths ===
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FAISS_DIR = os.path.join(BASE_DIR, "faiss_data")
INDEX_PATH = os.path.join(FAISS_DIR, "face_index.faiss")
IDS_PATH = os.path.join(FAISS_DIR, "rollnos.pkl")

# === Load Index & IDs ===
if not os.path.exists(INDEX_PATH) or not os.path.exists(IDS_PATH):
    print("[] Missing FAISS index or rollnos.pkl")
    print("Unknown")
    sys.exit(1)

index = faiss.read_index(INDEX_PATH)
with open(IDS_PATH, "rb") as f:
    student_ids = pickle.load(f)

if index.ntotal != len(student_ids):
    print(f"[] FAISS index vectors ({index.ntotal}) ≠ rollnos ({len(student_ids)})")
    print("Unknown")
    sys.exit(1)

# === Input Handling ===
if len(sys.argv) < 2:
    print("[] No image path provided")
    print("Unknown")
    sys.exit(1)

image_path = sys.argv[1]
target_roll = sys.argv[2] if len(sys.argv) > 2 else None

print(f"[] Image path received: {image_path}")
if target_roll:
    print(f"[🎯] Target roll number: {target_roll}")

if not os.path.exists(image_path):
    print(f"[] Image file not found: {image_path}")
    print("Unknown")
    sys.exit(1)

# === Load Face Model ===
print("[] Initializing face model...")
with suppress_stdout_stderr():
    model = insightface.app.FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
    model.prepare(ctx_id=0)
print("[] Face model ready")

# === Load Image ===
img = cv2.imread(image_path)
if img is None:
    print(f"[] OpenCV failed to load image: {image_path}")
    print("Unknown")
    sys.exit(1)

img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
faces = model.get(img_rgb)

if not faces:
    print("[] No faces detected in image")
    print("Unknown")
    sys.exit(0)

print(f"[] Detected {len(faces)} face(s)")

# === Extract Largest Face ===
best_face = max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))
embedding = best_face.embedding
embedding = embedding / np.linalg.norm(embedding)
query_vector = np.array([embedding], dtype=np.float32)

if query_vector.shape[1] != index.d:
    print(f"[] Embedding dim {query_vector.shape[1]} does not match FAISS dim {index.d}")
    print("Unknown")
    sys.exit(1)

# === Search FAISS ===
D, I = index.search(query_vector, k=3)
distances = D[0]
indices = I[0]

print(f"[] FAISS distances: {distances.tolist()}")
print(f"[] Closest match index: {indices[0]}")

# === Threshold Check ===
threshold = 1.0
if len(indices) == 0 or len(distances) == 0 or distances[0] > threshold:
    print("[] No match within threshold")
    print("Unknown")
else:
    matched_id = student_ids[indices[0]]
    print(f"[] Match found: {matched_id} (distance: {distances[0]:.4f})")

    if target_roll:
        if matched_id == target_roll:
            print("[] Target roll matched")
            print(matched_id)
        else:
            print("[] Target roll mismatch")
            print("Face does not match selected student")
    else:
        print(matched_id)
