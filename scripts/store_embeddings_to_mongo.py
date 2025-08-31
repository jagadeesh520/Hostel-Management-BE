import os
import cv2
import numpy as np
import pymongo
from insightface.app import FaceAnalysis

# === Config: Faces Directory ===
if os.name == "nt":  # Windows (local dev)
    FACES_DIR = r"C:/Project/College_Management/hostel-app-be/uploads/faces"
else:  # Linux (AWS)
    PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    FACES_DIR = os.path.join(PROJECT_ROOT, "uploads", "faces")

print(f"📂 Using faces directory: {FACES_DIR}")

if not os.path.exists(FACES_DIR):
    raise FileNotFoundError(f"❌ Faces directory not found: {FACES_DIR}")

# === Connect to MongoDB Atlas ===
client = pymongo.MongoClient(
    "mongodb+srv://Jagadeesh:qWUsu0HL1ic6OA5f@cluster0.mgutntl.mongodb.net/hostelManagementDB?retryWrites=true&w=majority&appName=Cluster0"
)
db = client["hostelManagementDB"]
students_collection = db["students"]

# === Setup InsightFace (CPU or GPU) ===
app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
app.prepare(ctx_id=0)

# === Process each student folder ===
for rollNo in os.listdir(FACES_DIR):
    student_path = os.path.join(FACES_DIR, rollNo)
    if not os.path.isdir(student_path):
        continue

    embeddings = []
    image_names = []

    for image_name in os.listdir(student_path):
        img_path = os.path.join(student_path, image_name)
        img = cv2.imread(img_path)
        if img is None:
            print(f"⚠️ Failed to load image: {img_path}")
            continue

        faces = app.get(img)
        if not faces:
            print(f"⚠️ No face found in: {img_path}")
            continue

        embedding = faces[0].embedding
        if embedding is not None:
            embeddings.append(embedding.tolist())
            image_names.append(image_name)

    if len(embeddings) >= 3:
        students_collection.update_one(
            {"rollNo": rollNo},
            {"$set": {"faceEmbeddings": embeddings, "imageFiles": image_names}},
            upsert=True,
        )
        print(f"[✔] Stored {len(embeddings)} embeddings for rollNo: {rollNo}")
    else:
        print(f"[✘] Skipped {rollNo} — less than 3 valid face embeddings")
