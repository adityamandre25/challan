import os
import cv2
import numpy as np
import base64
import tempfile

from PIL import Image
from dotenv import load_dotenv
from google import genai

try:
    from ultralytics import YOLO
    HAS_ML_LIBRARIES = True
except ImportError:
    HAS_ML_LIBRARIES = False


VIOLATION_CLASSES = {
    "driver_without_helmet",
    "passenger_without_helmet",
}


def _normalize_plate(text: str) -> str:
    """Strip spaces/dashes and uppercase — TN 09 BT 9721 → TN09BT9721."""
    return "".join(c for c in text.upper() if c.isalnum())


def _center(box):
    x1, y1, x2, y2 = box
    return (x1 + x2) // 2, (y1 + y2) // 2


def _inside(cx, cy, box):
    x1, y1, x2, y2 = box
    return x1 <= cx <= x2 and y1 <= cy <= y2


def _dist_sq(cx, cy, box):
    """Squared Euclidean distance from point to box center."""
    bx, by = _center(box)
    return (cx - bx) ** 2 + (cy - by) ** 2


def _nearest(cx, cy, boxes):
    """Return the box whose center is closest to (cx, cy). None if list empty."""
    if not boxes:
        return None
    return min(boxes, key=lambda b: _dist_sq(cx, cy, b))


class AIEngine:

    def __init__(self):
        self.model = None
        self.plate_model = None
        self.gemini_client = None

        load_dotenv()

        try:
            api_key = os.getenv("GEMINI_API_KEY")
            if api_key:
                self.gemini_client = genai.Client(api_key=api_key)
                print("[AI Engine] Gemini client loaded.")
        except Exception as e:
            print(f"[AI Engine] Gemini init failed: {e}")

        if HAS_ML_LIBRARIES:
            try:
                base = os.path.dirname(__file__)
                self.model = YOLO(os.path.join(base, "best.pt"))
                self.plate_model = YOLO(
                    os.path.join(base, "number_plate_detection.pt")
                )
                print("[AI Engine] Helmet model loaded.")
                print("[AI Engine] Plate model loaded.")
                print("Helmet Classes:")
                for idx, name in self.model.names.items():
                    print(f"  {idx}: {name}")
            except Exception as e:
                print(f"[AI Engine] Failed to load models: {e}")
                self.model = None
                self.plate_model = None
        else:
            print("[AI Engine] Ultralytics not installed.")

    # ------------------------------------------------------------------
    # Gemini OCR
    # ------------------------------------------------------------------

    def read_plate_with_gemini(self, plate_img) -> str:
        if self.gemini_client is None:
            return "UNKNOWN"
        try:
            temp_path = os.path.join(tempfile.gettempdir(), "temp_plate.jpg")
            cv2.imwrite(temp_path, plate_img)
            img = Image.open(temp_path)
            response = self.gemini_client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[
                    (
                        "Read the vehicle registration number from this image. "
                        "Return ONLY the registration number. "
                        "Remove spaces. Use uppercase only. "
                        "If unreadable return UNKNOWN."
                    ),
                    img,
                ],
            )
            raw = response.text.strip()
            plate = _normalize_plate(raw)
            return plate if plate else "UNKNOWN"
        except Exception as e:
            print(f"[AI Engine] Gemini OCR error: {e}")
            return "UNKNOWN"

    # ------------------------------------------------------------------
    # Public entry points
    # ------------------------------------------------------------------

    def process_image(self, image_bytes):
        """
        Returns: list of detected_vehicle dicts, plus annotated image b64.

        Each dict:
            {
                "vehicle_number": str,
                "violation_type": str,
                "processed_img_b64": str,   # full annotated frame
                "crop_img_b64": str | None, # crop of violation box
            }
        """
        if self.model is None:
            return []

        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return []
            return self._run_model(img)
        except Exception as e:
            print(f"[AI Engine] Image processing error: {e}")
            return []

    def process_video(self, video_path):
        """
        Returns: list of unique detected_vehicle dicts across all frames.
        Deduplication is by normalised plate number.
        """
        if self.model is None:
            return []

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return []

        seen_plates = set()
        all_vehicles = []
        frame_count = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                frame_count += 1
                if frame_count % 5 != 0:
                    continue

                vehicles = self._run_model(frame)
                for v in vehicles:
                    plate = v["vehicle_number"]
                    key = plate if plate != "UNKNOWN" else None
                    if key and key in seen_plates:
                        continue
                    if key:
                        seen_plates.add(key)
                    all_vehicles.append(v)

        except Exception as e:
            print(f"[AI Engine] Video processing error: {e}")
        finally:
            cap.release()

        return all_vehicles

    # ------------------------------------------------------------------
    # Core detection
    # ------------------------------------------------------------------

    def _run_model(self, img):
        """
        Runs helmet + plate detection on a single frame.
        Returns list of dicts (one per unique violation+plate pair).
        """
        if self.model is None:
            return []

        original_img = img.copy()

        # ── Step 1: Helmet detection ──────────────────────────────────
        results = self.model.predict(source=img, conf=0.25, verbose=False)
        result = results[0]

        bikes = []       # list of (x1,y1,x2,y2)
        violations = []  # list of {"label", "box", "crop_b64"}

        for box in result.boxes:
            cls_id = int(box.cls[0])
            confidence = float(box.conf[0])
            label = self.model.names[cls_id]
            x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)

            color = (0, 255, 0)

            if label == "bike":
                bikes.append((x1, y1, x2, y2))

            elif label in VIOLATION_CLASSES:
                color = (0, 0, 255)
                crop = img[
                    max(0, y1): max(y2, y1 + 1),
                    max(0, x1): max(x2, x1 + 1),
                ]
                crop_b64 = None
                if crop is not None and crop.size > 0:
                    ok, buf = cv2.imencode(".jpg", crop)
                    if ok:
                        crop_b64 = base64.b64encode(buf).decode("utf-8")
                violations.append(
                    {"label": label, "box": (x1, y1, x2, y2), "crop_b64": crop_b64}
                )

            cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
            cv2.putText(
                img,
                f"{label} {confidence:.2f}",
                (x1, max(30, y1 - 10)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                color,
                2,
            )

        if not violations:
            return []

        # ── Step 2: Plate detection ───────────────────────────────────
        plate_boxes = []  # list of (px1,py1,px2,py2)

        if self.plate_model is not None:
            try:
                plate_results = self.plate_model.predict(
                    source=original_img, conf=0.25, verbose=False
                )
                for pbox in plate_results[0].boxes:
                    px1, py1, px2, py2 = pbox.xyxy[0].cpu().numpy().astype(int)
                    plate_boxes.append((px1, py1, px2, py2))
            except Exception as e:
                print(f"[AI Engine] Plate detection error: {e}")

        # ── Step 3: Annotated frame → b64 ────────────────────────────
        ok, buf = cv2.imencode(".jpg", img)
        if not ok:
            return []
        frame_b64 = base64.b64encode(buf).decode("utf-8")

        # ── Step 4: Associate violations → bikes → plates ────────────
        detected = []
        seen_plates_local = set()

        for v in violations:
            vbox = v["box"]
            vcx, vcy = _center(vbox)

            # ── Violation → bike: containment, fallback nearest ───────
            parent_bike = None
            for bk in bikes:
                if _inside(vcx, vcy, bk):
                    parent_bike = bk
                    break
            if parent_bike is None:
                parent_bike = _nearest(vcx, vcy, bikes)  # fallback

            # ── Bike → plate: containment, fallback nearest ───────────
            vehicle_number = "UNKNOWN"
            matched_plate = None

            if parent_bike is not None:
                bkcx, bkcy = _center(parent_bike)

                # Primary: plate center inside bike box
                for pbox in plate_boxes:
                    pcx, pcy = _center(pbox)
                    if _inside(pcx, pcy, parent_bike):
                        matched_plate = pbox
                        break

                # Fallback: nearest plate to bike center
                if matched_plate is None:
                    matched_plate = _nearest(bkcx, bkcy, plate_boxes)

            if matched_plate is not None:
                px1, py1, px2, py2 = matched_plate
                plate_crop = original_img[
                    max(0, py1): py2,
                    max(0, px1): px2,
                ]
                if plate_crop is not None and plate_crop.size > 0:
                    raw = self.read_plate_with_gemini(plate_crop)
                    vehicle_number = _normalize_plate(raw) or "UNKNOWN"

            # ── Drop UNKNOWN — don't insert unidentified challans ─────
            if vehicle_number == "UNKNOWN":
                continue

            # ── Deduplicate within this frame ─────────────────────────
            if vehicle_number in seen_plates_local:
                continue
            seen_plates_local.add(vehicle_number)

            detected.append(
                {
                    "vehicle_number": vehicle_number,
                    "violation_type": v["label"],
                    "processed_img_b64": frame_b64,
                    "crop_img_b64": v["crop_b64"],
                }
            )

        return detected


ai_engine = AIEngine()
