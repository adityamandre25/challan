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


class AIEngine:

    def __init__(self):

        self.model = None
        self.plate_model = None
        self.gemini_client = None

        load_dotenv()

        try:

            api_key = os.getenv("GEMINI_API_KEY")

            if api_key:
                self.gemini_client = genai.Client(
                    api_key=api_key
                )
                print("[AI Engine] Gemini client loaded.")

        except Exception as e:

            print(
                f"[AI Engine] Gemini init failed: {e}"
            )

        if HAS_ML_LIBRARIES:

            try:

                helmet_model_path = os.path.join(
                    os.path.dirname(__file__),
                    "best.pt"
                )

                plate_model_path = os.path.join(
                    os.path.dirname(__file__),
                    "number_plate_detection.pt"
                )

                self.model = YOLO(
                    helmet_model_path
                )

                self.plate_model = YOLO(
                    plate_model_path
                )

                print(
                    "[AI Engine] Helmet model loaded."
                )

                print(
                    "[AI Engine] Plate model loaded."
                )

                print("Helmet Classes:")

                for idx, name in self.model.names.items():
                    print(f"{idx}: {name}")

            except Exception as e:

                print(
                    f"[AI Engine] Failed to load models: {e}"
                )

                self.model = None
                self.plate_model = None

        else:

            print(
                "[AI Engine] Ultralytics not installed."
            )

    def read_plate_with_gemini(
        self,
        plate_img
    ):

        try:

            if self.gemini_client is None:
                return "UNKNOWN"

            temp_path = os.path.join(
                tempfile.gettempdir(),
                "temp_plate.jpg"
            )

            cv2.imwrite(
                temp_path,
                plate_img
            )

            img = Image.open(
                temp_path
            )

            response = (
                self.gemini_client
                .models
                .generate_content(
                    model="gemini-2.5-flash",
                    contents=[
                        (
                            "Read the vehicle "
                            "registration number "
                            "from this image. "
                            "Return ONLY the "
                            "registration number. "
                            "Remove spaces. "
                            "Use uppercase only. "
                            "If unreadable return "
                            "UNKNOWN."
                        ),
                        img
                    ]
                )
            )

            plate_number = (
                response.text
                .strip()
                .replace(" ", "")
                .upper()
            )

            if not plate_number:
                return "UNKNOWN"

            return plate_number

        except Exception as e:

            print(
                f"[AI Engine] Gemini OCR error: {e}"
            )

            return "UNKNOWN"

    def process_image(
        self,
        image_bytes
    ):

        if self.model is None:

            return (
                False,
                None,
                None,
                None,
                "UNKNOWN"
            )

        try:

            nparr = np.frombuffer(
                image_bytes,
                np.uint8
            )

            img = cv2.imdecode(
                nparr,
                cv2.IMREAD_COLOR
            )

            if img is None:

                return (
                    False,
                    None,
                    None,
                    None,
                    "UNKNOWN"
                )

            return self._run_model(
                img
            )

        except Exception as e:

            print(
                f"[AI Engine] "
                f"Image processing error: {e}"
            )

            return (
                False,
                None,
                None,
                None,
                "UNKNOWN"
            )

    def process_video(
        self,
        video_path
    ):

        if self.model is None:

            return (
                False,
                None,
                None,
                None,
                "UNKNOWN"
            )

        cap = cv2.VideoCapture(
            video_path
        )

        if not cap.isOpened():

            return (
                False,
                None,
                None,
                None,
                "UNKNOWN"
            )

        frame_count = 0

        first_processed_frame = None

        try:

            while True:

                ret, frame = cap.read()

                if not ret:
                    break

                frame_count += 1

                if frame_count % 5 != 0:
                    continue

                (
                    has_violation,
                    processed_frame,
                    crop_frame,
                    violation_type,
                    vehicle_number
                ) = self._run_model(
                    frame
                )

                if (
                    first_processed_frame
                    is None
                ):
                    first_processed_frame = (
                        processed_frame
                    )

                if has_violation:

                    cap.release()

                    return (
                        True,
                        processed_frame,
                        crop_frame,
                        violation_type,
                        vehicle_number
                    )

            cap.release()

            return (
                False,
                first_processed_frame,
                None,
                None,
                "UNKNOWN"
            )

        except Exception as e:

            cap.release()

            print(
                f"[AI Engine] "
                f"Video processing error: {e}"
            )

            return (
                False,
                None,
                None,
                None,
                "UNKNOWN"
            )

    def _run_model(
        self,
        img
    ):

        if self.model is None:

            return (
                False,
                None,
                None,
                None,
                "UNKNOWN"
            )

        original_img = img.copy()

        results = self.model.predict(
            source=img,
            conf=0.25,
            verbose=False
        )

        result = results[0]

        has_violation = False
        violation_type = None
        violation_crop = None

        violation_classes = {
            "driver_without_helmet",
            "passenger_without_helmet"
        }

        for box in result.boxes:

            cls_id = int(
                box.cls[0]
            )

            confidence = float(
                box.conf[0]
            )

            label = (
                self.model.names[
                    cls_id
                ]
            )

            x1, y1, x2, y2 = (
                box.xyxy[0]
                .cpu()
                .numpy()
                .astype(int)
            )

            color = (
                0,
                255,
                0
            )

            if (
                label
                in violation_classes
            ):

                has_violation = True

                violation_type = (
                    label
                )

                color = (
                    0,
                    0,
                    255
                )

                violation_crop = img[
                    max(0, y1):
                    max(y2, y1 + 1),

                    max(0, x1):
                    max(x2, x1 + 1)
                ]

            cv2.rectangle(
                img,
                (x1, y1),
                (x2, y2),
                color,
                2
            )

            cv2.putText(
                img,
                f"{label} "
                f"{confidence:.2f}",
                (
                    x1,
                    max(
                        30,
                        y1 - 10
                    )
                ),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                color,
                2
            )

        vehicle_number = "UNKNOWN"

        if (
            has_violation
            and self.plate_model
            is not None
        ):

            try:

                plate_results = (
                    self.plate_model.predict(
                        source=original_img,
                        conf=0.25,
                        verbose=False
                    )
                )

                plate_result = (
                    plate_results[0]
                )

                best_box = None
                best_conf = 0

                for box in (
                    plate_result.boxes
                ):

                    conf = float(
                        box.conf[0]
                    )

                    if conf > best_conf:

                        best_conf = conf
                        best_box = box

                if best_box is not None:

                    (
                        px1,
                        py1,
                        px2,
                        py2
                    ) = (
                        best_box.xyxy[0]
                        .cpu()
                        .numpy()
                        .astype(int)
                    )

                    plate_crop = (
                        original_img[
                            max(0, py1):
                            py2,

                            max(0, px1):
                            px2
                        ]
                    )

                    if (
                        plate_crop
                        is not None
                        and plate_crop.size > 0
                    ):

                        vehicle_number = (
                            self
                            .read_plate_with_gemini(
                                plate_crop
                            )
                        )

            except Exception as e:

                print(
                    f"[AI Engine] "
                    f"Plate detection error: {e}"
                )

        success, img_buffer = (
            cv2.imencode(
                ".jpg",
                img
            )
        )

        if not success:

            return (
                False,
                None,
                None,
                None,
                "UNKNOWN"
            )

        processed_img_b64 = (
            base64.b64encode(
                img_buffer
            )
            .decode("utf-8")
        )

        crop_img_b64 = None

        if (
            violation_crop is not None
            and violation_crop.size > 0
        ):

            success, crop_buffer = (
                cv2.imencode(
                    ".jpg",
                    violation_crop
                )
            )

            if success:

                crop_img_b64 = (
                    base64
                    .b64encode(
                        crop_buffer
                    )
                    .decode("utf-8")
                )

        return (
            has_violation,
            processed_img_b64,
            crop_img_b64,
            violation_type,
            vehicle_number
        )


ai_engine = AIEngine()