import os
import tempfile
from datetime import datetime

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import database
from ai_engine import ai_engine

app = FastAPI(title="Helmet Detection & E-Challan System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = tempfile.gettempdir()

SUPPORTED_IMAGES = {".jpg", ".jpeg", ".png", ".webp"}
SUPPORTED_VIDEOS = {".mp4", ".avi", ".mov", ".mkv"}


class DispatchRequest(BaseModel):
    challan_id: int
    phone_number: str


class PayRequest(BaseModel):
    challan_id: int


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def _reason(violation_type: str) -> str:
    if violation_type == "driver_without_helmet":
        return "Driver riding without helmet (Section 194D MV Act)"
    if violation_type == "passenger_without_helmet":
        return "Passenger riding without helmet (Section 194D MV Act)"
    return "Helmet violation detected (Section 194D MV Act)"


def _build_challans(detected_vehicles: list) -> list:
    """
    Insert one challan per detected vehicle.
    Returns list of challan response dicts.
    """
    challans = []
    timestamp = datetime.now().strftime("%d-%m-%Y %I:%M %p")
    fine_amount = 1000

    for v in detected_vehicles:
        vehicle_number = v["vehicle_number"]
        violation_type = v["violation_type"]
        reason = _reason(violation_type)
        image_data = f"data:image/jpeg;base64,{v['processed_img_b64']}"
        crop_data = (
            f"data:image/jpeg;base64,{v['crop_img_b64']}"
            if v.get("crop_img_b64")
            else None
        )

        new_id = database.add_challan(
            vehicle_number=vehicle_number,
            reason=reason,
            fine_amount=fine_amount,
            timestamp=timestamp,
            image_data=image_data,
        )

        challans.append(
            {
                "challan_id": new_id,
                "vehicle_number": vehicle_number,
                "violation_type": violation_type,
                "reason": reason,
                "fine_amount": fine_amount,
                "timestamp": timestamp,
                "image_data": image_data,
                "violation_crop": crop_data,
            }
        )

    return challans


# ─────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────

@app.get("/api/history")
def get_history():
    try:
        return database.get_all_challans()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/upload")
async def upload_media(file: UploadFile = File(...)):
    file_bytes = await file.read()
    filename = file.filename
    file_ext = os.path.splitext(filename)[1].lower()

    is_video = file_ext in SUPPORTED_VIDEOS
    is_image = file_ext in SUPPORTED_IMAGES

    if not is_video and not is_image:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file format. Please upload an image or video.",
        )

    try:
        detected_vehicles = []

        if is_image:
            detected_vehicles = ai_engine.process_image(file_bytes)

        else:
            temp_file_path = os.path.join(TEMP_DIR, filename)
            with open(temp_file_path, "wb") as f:
                f.write(file_bytes)
            try:
                detected_vehicles = ai_engine.process_video(temp_file_path)
            finally:
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)

        if not detected_vehicles:
            return {
                "status": "clear",
                "message": "No helmet violation detected.",
            }

        challans = _build_challans(detected_vehicles)

        return {
            "status": "violation",
            "total_challans": len(challans),
            "challans": challans,
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@app.post("/api/challan/dispatch")
def dispatch_challan(req: DispatchRequest):
    print(f"[Dispatch] Querying RTO for Challan #{req.challan_id}...")
    print(
        f"[Dispatch] Sending Mock SMS to owner at "
        f"{req.phone_number} with E-Challan payment link..."
    )
    return {
        "status": "success",
        "message": (
            f"Challan #{req.challan_id} dispatched successfully "
            f"to registered mobile {req.phone_number}!"
        ),
    }


@app.post("/api/challan/pay")
def pay_challan(req: PayRequest):
    try:
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE challans SET status = 'Paid' WHERE id = ?",
            (req.challan_id,),
        )
        conn.commit()
        conn.close()
        return {
            "status": "success",
            "message": f"Challan #{req.challan_id} marked as Paid.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    print("Starting FastAPI dev server...")
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
