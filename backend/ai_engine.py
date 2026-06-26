import os
import cv2
import numpy as np
import base64
import tempfile
import time
from PIL import Image
from dotenv import load_dotenv
from google import genai

try:
    from ultralytics import YOLO
    HAS_ML_LIBRARIES = True
except ImportError:
    HAS_ML_LIBRARIES = False


try:
    import easyocr
    HAS_EASYOCR = True
except ImportError:
    HAS_EASYOCR = False


FRAME_SAMPLE_RATE = 10


VIOLATION_CLASSES = {
    "driver_without_helmet",
    "passenger_without_helmet",
}


_LETTER_FIXES = str.maketrans("01589", "OISGB")  
_DIGIT_FIXES  = str.maketrans("OIQSZB", "012528") 
_LETTER_POSITIONS = {0, 1, 4, 5}
_DIGIT_POSITIONS  = {2, 3, 6, 7, 8, 9}


def _normalize_plate(text: str) -> str:
    """
    Strip spaces/dashes, uppercase, then apply positional OCR-error correction
    for Indian registration plates.

    Examples:
        "KA 0O BT 9721" → "KA00BT9721"  (O→0 in digit zone)
        "KA O9 BT 9721" → "KA09BT9721"  (O→0 in digit zone)
        "K4 09 BT 9721" → "KA09BT9721"  (4→A in letter zone)
    """
    raw = "".join(c for c in text.upper() if c.isalnum())
    if not raw:
        return ""

    chars = list(raw)
    corrected = []
    for i, ch in enumerate(chars):
        if i in _LETTER_POSITIONS:
            
            corrected.append(ch.translate(_LETTER_FIXES) if ch.isdigit() else ch)
        elif i in _DIGIT_POSITIONS:
            
            corrected.append(ch.translate(_DIGIT_FIXES) if ch.isalpha() else ch)
        else:
            corrected.append(ch) 

    return "".join(corrected)


def _center(box):
    x1, y1, x2, y2 = box
    return (x1 + x2) // 2, (y1 + y2) // 2


def _inside(cx, cy, box):
    x1, y1, x2, y2 = box
    return x1 <= cx <= x2 and y1 <= cy <= y2


def _dist_sq(cx, cy, box):
    bx, by = _center(box)
    return (cx - bx) ** 2 + (cy - by) ** 2


def _nearest(cx, cy, boxes):
    if not boxes:
        return None
    return min(boxes, key=lambda b: _dist_sq(cx, cy, b))


class AIEngine:

    def __init__(self):
        self.model = None
        self.plate_model = None
        self.easyocr_reader = None

        load_dotenv()

        self.gemini_keys = []
        temp_keys = []
        for key_name in os.environ.keys():
            if key_name.startswith("GEMINI_API_KEY_"):
                val = os.environ[key_name].strip()
                if val:
                    suffix = key_name[len("GEMINI_API_KEY_"):]
                    try:
                        num = int(suffix)
                    except ValueError:
                        num = float('inf')
                    temp_keys.append((num, key_name, val))

        temp_keys.sort(key=lambda x: (x[0], x[1]))
        self.gemini_keys = [val for _, _, val in temp_keys]

        if not self.gemini_keys:
            val = (os.getenv("GEMINI_API_KEY") or "").strip()
            if val:
                self.gemini_keys.append(val)

        print(f"[AI Engine] Discovered {len(self.gemini_keys)} Gemini API keys.")
        self.current_key_idx = 0
        self.use_fallback_ocr = False

       
        if HAS_EASYOCR:
            try:
                self.easyocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)
                print("[AI Engine] EasyOCR fallback loaded.")
            except Exception as e:
                print(f"[AI Engine] EasyOCR init failed: {e}")
        else:
            print("[AI Engine] EasyOCR not installed — no OCR fallback available. "
                  "Run: pip install easyocr")

        
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

    
    
    

    def reset_key_rotation(self):
        self.current_key_idx = 0
        self.use_fallback_ocr = False

    def _try_gemini_with_current_key(self, plate_img):
        if self.current_key_idx >= len(self.gemini_keys):
            return "", False
        key = self.gemini_keys[self.current_key_idx]
        print(f"USING GEMINI KEY INDEX: {self.current_key_idx}")
        try:
            client = genai.Client(api_key=key)
            temp_path = os.path.join(tempfile.gettempdir(), "temp_plate.jpg")
            cv2.imwrite(temp_path, plate_img)
            img = Image.open(temp_path)
            time.sleep(1)
            response = client.models.generate_content(
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
            return (plate if plate else "", False)
        except Exception as e:
            err_str = str(e).lower()
            print(f"[AI Engine] [OCR] Gemini API error with key index {self.current_key_idx}: {e}")
            rotatable_keywords = [
                "429", "toomanyrequests", "too many requests", "resource_exhausted",
                "quota exceeded", "quota", "rate limit", "rate_limit", "ratelimit",
                "timeout", "deadline", "unavailable", "service unavailable", "exhausted"
            ]
            should_rotate = any(kw in err_str for kw in rotatable_keywords)
            return "", should_rotate

    def read_plate_with_easyocr(self, plate_img) -> str:
        if self.easyocr_reader is None:
            print("[AI Engine] [OCR] EasyOCR not available — cannot read plate.")
            return ""

        try:
            rgb = cv2.cvtColor(plate_img, cv2.COLOR_BGR2RGB)
            results = self.easyocr_reader.readtext(rgb, detail=0, paragraph=True)
            raw = " ".join(results).strip()
            plate = _normalize_plate(raw)
            if plate:
                print(f"[AI Engine] [OCR] EasyOCR read: {plate}")
            return plate if plate else ""
        except Exception as e:
            print(f"[AI Engine] [OCR] EasyOCR failed: {e}")
            return ""

    def read_plate(self, plate_img) -> str:
        if self.use_fallback_ocr or not self.gemini_keys:
            result = self.read_plate_with_easyocr(plate_img)
            return result if result else "UNKNOWN"

        while self.current_key_idx < len(self.gemini_keys):
            result, should_rotate = self._try_gemini_with_current_key(plate_img)
            if result:
                return result
            if should_rotate:
                print(f"[AI Engine] [OCR] Rotating to next Gemini key (index: {self.current_key_idx + 1}).")
                self.current_key_idx += 1
            else:
                self.current_key_idx += 1

        self.use_fallback_ocr = True
        print("[AI Engine] [OCR] All Gemini keys exhausted. Falling back to EasyOCR.")
        result = self.read_plate_with_easyocr(plate_img)
        return result if result else "UNKNOWN"

    
    
    

    def process_image(self, image_bytes, location="Camera Zone A"):
        self.reset_key_rotation()
        if self.model is None:
            return []

        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return []
            return self._run_model(img, location)
        except Exception as e:
            print(f"[AI Engine] Image processing error: {e}")
            return []

    def process_video(self, video_path, location="Camera Zone A",
                      frame_sample_rate: int = FRAME_SAMPLE_RATE):
        self.reset_key_rotation()
        if self.model is None:
            return []

        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return []

        
        
        seen_keys = set()
        all_vehicles = []
        frame_count = 0

        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    break

                frame_count += 1
                if frame_count % frame_sample_rate != 0:
                    continue

                vehicles = self._run_model(frame, location)
                for v in vehicles:
                    plate = v["vehicle_number"]
                    vtype = v["violation_type"]
                    key = (plate, vtype)

                    if key in seen_keys:
                        continue
                    seen_keys.add(key)
                    all_vehicles.append(v)

        except Exception as e:
            print(f"[AI Engine] Video processing error: {e}")
        finally:
            cap.release()

        print(f"[AI Engine] Video done. Frames scanned: {frame_count // frame_sample_rate}, "
              f"Unique violations found: {len(all_vehicles)}")
        return all_vehicles

    
    
    

    def _run_model(self, img, location="Camera Zone A"):
        """Runs helmet + plate detection on a single frame."""
        if self.model is None:
            return []

        original_img = img.copy()

        
        results = self.model.predict(source=img, conf=0.25, verbose=False)
        result = results[0]

        bikes = []       
        violations = []  

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

        
        plate_boxes = []

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

        
        try:
            height, width = img.shape[:2]
            font = cv2.FONT_HERSHEY_SIMPLEX
            font_scale = 0.6
            thickness = 2
            text = f"CAM: {location.upper()}"
            text_size = cv2.getTextSize(text, font, font_scale, thickness)[0]
            text_width, text_height = text_size
            padding = 8
            rect_x1 = width - text_width - padding * 2 - 20
            rect_y1 = height - text_height - padding * 2 - 20
            rect_x2 = width - 20
            rect_y2 = height - 20
            cv2.rectangle(img, (rect_x1, rect_y1), (rect_x2, rect_y2), (11, 15, 25), -1)
            cv2.rectangle(img, (rect_x1, rect_y1), (rect_x2, rect_y2), (255, 240, 0), 1)
            text_x = rect_x1 + padding
            text_y = rect_y2 - padding
            cv2.putText(img, text, (text_x, text_y), font, font_scale,
                        (255, 255, 255), thickness, cv2.LINE_AA)
        except Exception as e:
            print(f"[AI Engine] Location overlay error: {e}")

        ok, buf = cv2.imencode(".jpg", img)
        if not ok:
            return []
        frame_b64 = base64.b64encode(buf).decode("utf-8")

        
        detected = []
        seen_plates_local = set()  

        for v in violations:
            vbox = v["box"]
            vcx, vcy = _center(vbox)

            
            parent_bike = None
            for bk in bikes:
                if _inside(vcx, vcy, bk):
                    parent_bike = bk
                    break
            if parent_bike is None:
                parent_bike = _nearest(vcx, vcy, bikes)

            
            vehicle_number = "UNKNOWN"
            matched_plate = None

            if parent_bike is not None:
                bkcx, bkcy = _center(parent_bike)

                for pbox in plate_boxes:
                    pcx, pcy = _center(pbox)
                    if _inside(pcx, pcy, parent_bike):
                        matched_plate = pbox
                        break

                if matched_plate is None:
                    matched_plate = _nearest(bkcx, bkcy, plate_boxes)

            if matched_plate is not None:
                px1, py1, px2, py2 = matched_plate
                plate_crop = original_img[
                    max(0, py1): py2,
                    max(0, px1): px2,
                ]
                if plate_crop is not None and plate_crop.size > 0:
                    raw = self.read_plate(plate_crop)  
                    vehicle_number = _normalize_plate(raw) or "UNKNOWN"

            if vehicle_number == "UNKNOWN":
                continue

            if len(vehicle_number) <= 7:
                continue

            dedup_key = (vehicle_number, v["label"])
            if dedup_key in seen_plates_local:
                continue
            seen_plates_local.add(dedup_key)

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