import cv2
import numpy as np
import faiss
import os
from datetime import datetime, timezone
import pymongo
import pickle
import insightface
from deep_sort_realtime.deepsort_tracker import DeepSort

# === Constants ===
ROLLNO_FIELD = "rollNo"
NAME_FIELD = "studentName"
ROOM_FIELD = "roomNo"
BLOCK_FIELD = "blockName"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FAISS_DIR = os.path.join(BASE_DIR, "faiss_data")
INDEX_PATH = os.path.join(FAISS_DIR, "face_index.faiss")
ROLLNO_PATH = os.path.join(FAISS_DIR, "rollnos.pkl")

def load_faiss_index():
    print("[ℹ️] Loading FAISS index...")
    if not os.path.exists(INDEX_PATH):
        print("[💥] FAISS index not found.")
        exit(1)
    index = faiss.read_index(INDEX_PATH)
    print(f"[ℹ️] Loaded FAISS index with {index.ntotal} vectors.")
    return index

def load_roll_numbers():
    if not os.path.exists(ROLLNO_PATH):
        print("[💥] rollnos.pkl not found.")
        exit(1)
    with open(ROLLNO_PATH, 'rb') as f:
        rollnos = pickle.load(f)
    return rollnos

def initialize_attendance(db, today):
    attendance_collection = db["attendances"]
    students_collection = db["students"]
    if attendance_collection.count_documents({"date": today}) > 0:
        print(f"[ℹ️] Attendance already initialized for today ({today}).")
        return
    print("[🕒] Initializing attendance...")
    for student in students_collection.find():
        attendance_collection.insert_one({
            "studentId": student["_id"],
            "studentName": student[NAME_FIELD],
            "roomNo": student[ROOM_FIELD],
            "rollNo": student[ROLLNO_FIELD],
            "blockName": student[BLOCK_FIELD],
            "status": "Absent",
            "timestamp": datetime.now(),
            "date": today
        })
    print(f"[✅] Attendance initialized.")

def mark_present(db, roll_no, today):
    students_collection = db["students"]
    attendance_collection = db["attendances"]
    student = students_collection.find_one({ROLLNO_FIELD: str(roll_no)})
    if not student:
        print(f"[⚠️] No student found with rollNo: {roll_no}")
        return
    result = attendance_collection.update_one(
        {"rollNo": roll_no, "date": today},
        {"$set": {"status": "Present", "timestamp": datetime.now()}}
    )
    if result.modified_count > 0:
        print(f"[✅] Marked present: {student[NAME_FIELD]} ({roll_no})")
    else:
        print(f"[ℹ️] Already marked present: {student[NAME_FIELD]} ({roll_no})")

def main():
    index = load_faiss_index()
    rollnos = load_roll_numbers()
    if len(rollnos) != index.ntotal:
        print("[💥] FAISS index and rollnos mismatch.")
        exit(1)

    client = pymongo.MongoClient("mongodb+srv://Jagadeesh:qWUsu0HL1ic6OA5f@cluster0.mgutntl.mongodb.net/hostelManagementDB?retryWrites=true&w=majority")
    db = client["hostelManagementDB"]

    print("[🧠] Loading InsightFace model...")
    model = insightface.app.FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider'])
    model.prepare(ctx_id=0)
    print("[✅] Model loaded.")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    initialize_attendance(db, today)

    recognition_buffer = {}
    last_marked = {}
    BUFFER_THRESHOLD = 3
    DEBOUNCE_SECONDS = 10

    tracker = DeepSort(max_age=30, embedder=None)

    print("[📷] Starting webcam. Press 'q' to quit...")
    video_capture = cv2.VideoCapture(0)

    while True:
        ret, frame = video_capture.read()
        if not ret:
            print("[💥] Failed to grab frame.")
            break

        faces = model.get(frame)
        detection_boxes = []
        embedding_list = []

        for face in faces:
            box = face.bbox.astype(int)
            x1, y1, x2, y2 = box
            conf = 0.99
            class_id = 0
            emb = np.array(face.embedding, dtype=np.float32)
            emb = emb / np.linalg.norm(emb)
            bbox_xywh = [x1, y1, x2 - x1, y2 - y1]
            detection_boxes.append((bbox_xywh, conf, class_id))
            embedding_list.append(emb)

        # ✅ Correct method for your version
        tracks = tracker.update_tracks(detection_boxes, embedding_list, frame)


        for track in tracks:
            if not track.is_confirmed():
                continue

            track_id = track.track_id
            tx, ty, tw, th = track.to_tlwh()

            matched_face = None
            for face in faces:
                x1, y1, x2, y2 = face.bbox.astype(int)
                if abs(x1 - tx) < 20 and abs(y1 - ty) < 20:
                    matched_face = face
                    break

            if matched_face is None:
                continue

            emb = matched_face.embedding
            query_vector = np.array([emb / np.linalg.norm(emb)], dtype=np.float32)
            if query_vector.shape[1] != index.d:
                continue

            distances, indices = index.search(query_vector, 1)
            similarity = distances[0][0]

            if similarity < 0.6:
                roll_index = indices[0][0]
                recognized_roll = rollnos[roll_index]
                recognition_buffer[track_id] = recognition_buffer.get(track_id, {})
                recognition_buffer[track_id][recognized_roll] = recognition_buffer[track_id].get(recognized_roll, 0) + 1

                if recognition_buffer[track_id][recognized_roll] >= BUFFER_THRESHOLD:
                    now = datetime.now().timestamp()
                    last_seen = last_marked.get(recognized_roll, 0)
                    if now - last_seen > DEBOUNCE_SECONDS:
                        mark_present(db, recognized_roll, today)
                        last_marked[recognized_roll] = now

                cv2.rectangle(frame, (int(tx), int(ty)), (int(tx + tw), int(ty + th)), (0, 255, 0), 2)
                cv2.putText(frame, f"{recognized_roll} ({similarity:.2f})", (int(tx), int(ty) - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)

            elif similarity < 0.85:
                cv2.rectangle(frame, (int(tx), int(ty)), (int(tx + tw), int(ty + th)), (0, 255, 255), 2)
                cv2.putText(frame, f"Detecting... ({similarity:.2f})", (int(tx), int(ty) - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            else:
                cv2.rectangle(frame, (int(tx), int(ty)), (int(tx + tw), int(ty + th)), (0, 0, 255), 2)
                cv2.putText(frame, f"Unknown ({similarity:.2f})", (int(tx), int(ty) - 10),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

        cv2.imshow("Face Recognition Attendance", frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    video_capture.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
