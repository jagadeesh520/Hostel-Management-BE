import os
import cv2
import numpy as np
import pymongo
from dotenv import load_dotenv
from insightface.app import FaceAnalysis

# === Load environment variables from .env in scripts/ ===
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.path.join(SCRIPT_DIR, ".env")
load_dotenv(dotenv_path=ENV_PATH)

# === Config: Faces Directory ===
if os.name == "nt":  # Windows (local dev)
    FACES_DIR = r"C:/Project/College_Management/hostel-app-be/uploads/faces"
else:  # Linux (AWS)
    PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
    FACES_DIR = os.path.join(PROJECT_ROOT, "uploads", "faces")

print(f"📂 Using faces directory: {FACES_DIR}")
if not os.path.exists(FACES_DIR):
    raise FileNotFoundError(f"❌ Faces directory not found: {FACES_DIR}")

# === Connect to MongoDB Atlas ===
mongo_uri = os.getenv("MONGO_URI")
if not mongo_uri:
    raise ValueError("❌ MONGO_URI not found in .env file")

client = pymongo.MongoClient(mongo_uri)
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
        try:
            students_collection.update_one(
                {"rollNo": rollNo},
                {"$set": {"faceEmbeddings": embeddings, "imageFiles": image_names}},
                upsert=True,
            )
            print(f"[✔] Stored {len(embeddings)} embeddings for rollNo: {rollNo}")
        except Exception as e:
            print(f"❌ Failed to store embeddings for {rollNo}: {e}")
    else:
        print(f"[✘] Skipped {rollNo} — less than 3 valid face embeddings")
