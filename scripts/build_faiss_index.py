import os
import pymongo
import faiss
import numpy as np
import pickle
from tqdm import tqdm
from dotenv import load_dotenv

# === Load environment variables from .env in project root ===
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
ENV_PATH = os.path.join(PROJECT_ROOT, ".env")
load_dotenv(dotenv_path=ENV_PATH)

# === Constants ===
EMBEDDING_DIM = 512
FAISS_DIR = os.path.join(SCRIPT_DIR, "faiss_data")
INDEX_PATH = os.path.join(FAISS_DIR, "face_index.faiss")
ROLLNOS_PKL_PATH = os.path.join(FAISS_DIR, "rollnos.pkl")
ROLLNOS_TXT_PATH = os.path.join(FAISS_DIR, "rollnos.txt")

os.makedirs(FAISS_DIR, exist_ok=True)

# === MongoDB Connection ===
mongo_uri = os.getenv("MONGO_URI")
if not mongo_uri:
    raise ValueError("❌ MONGO_URI not found in .env file")

try:
    client = pymongo.MongoClient(mongo_uri)
    db = client["hostelManagementDB"]
    students_collection = db["students"]
except Exception as e:
    raise ConnectionError(f"❌ Failed to connect to MongoDB: {e}")

# === Load Embeddings from Mongo ===
all_embeddings = []
rollno_list = []
no_image_students = []
invalid_shape_students = []

try:
    students = list(students_collection.find())
    print(f"[ℹ️] Total students fetched: {len(students)}")
except Exception as e:
    raise RuntimeError(f"❌ Failed to fetch students from MongoDB: {e}")

for student in tqdm(students, desc="Processing Students"):
    roll_no = student.get("rollNo")
    embeddings = student.get("faceEmbeddings", [])

    if not embeddings:
        no_image_students.append(roll_no)
        continue

    for emb in embeddings:
        emb_array = np.array(emb, dtype="float32")

        if emb_array.ndim == 2 and emb_array.shape[0] == 1:
            emb_array = emb_array.flatten()

        if emb_array.shape != (EMBEDDING_DIM,):
            invalid_shape_students.append(roll_no)
            continue

        normalized_emb = emb_array / np.linalg.norm(emb_array)
        all_embeddings.append(normalized_emb)
        rollno_list.append(roll_no)

# === Build FAISS Index ===
if not all_embeddings:
    print("[❌] No valid embeddings found. Cannot build FAISS index.")
    print(f"[📛] Students with no face images: {no_image_students}")
    print(f"[⚠️] Students with invalid embedding shape: {invalid_shape_students}")
    exit()

try:
    index = faiss.IndexFlatL2(EMBEDDING_DIM)
    index.add(np.array(all_embeddings))
    faiss.write_index(index, INDEX_PATH)
except Exception as e:
    raise RuntimeError(f"❌ Failed to build or save FAISS index: {e}")

# === Save Roll Numbers ===
try:
    with open(ROLLNOS_PKL_PATH, "wb") as f:
        pickle.dump(rollno_list, f)

    with open(ROLLNOS_TXT_PATH, "w") as f:
        for roll in rollno_list:
            f.write(f"{roll}\n")
except Exception as e:
    raise IOError(f"❌ Failed to save roll numbers: {e}")

# === Summary ===
print(f"[✔] FAISS index built with {len(rollno_list)} embeddings.")
print(f"[📁] Index saved at: {INDEX_PATH}")
print(f"[📁] Roll numbers saved at: {ROLLNOS_PKL_PATH} and {ROLLNOS_TXT_PATH}")
print(f"[📛] Students with no face images: {no_image_students}")
print(f"[⚠️] Students with invalid embedding shape: {invalid_shape_students}")

valid_students = sorted(set(rollno_list))
if valid_students:
    print(f"[💡] Valid face images found for roll numbers: {valid_students}")

if no_image_students or invalid_shape_students:
    all_invalid = sorted(set(no_image_students + invalid_shape_students))
    print(
        f"[ℹ️] Suggestion: Roll numbers {valid_students} have valid face images. "
        f"Others like {all_invalid} are missing or invalid."
    )
