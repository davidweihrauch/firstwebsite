import os
from PIL import Image, ImageOps
import time
import tempfile
import shutil

TARGET_SIZE_MB = 2
TARGET_SIZE_BYTES = TARGET_SIZE_MB * 1024 * 1024

def compress_in_place(jpg_path):
    # Save original filesystem timestamps
    stat = os.stat(jpg_path)
    original_times = (stat.st_atime, stat.st_mtime)

    img = Image.open(jpg_path)
    exif_data = img.info.get("exif")

    # Fix orientation (rotate pixels properly)
    img = ImageOps.exif_transpose(img)

    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    # Create temp file in same directory
    dir_name = os.path.dirname(jpg_path)
    with tempfile.NamedTemporaryFile(delete=False, dir=dir_name, suffix=".jpg") as tmp:
        temp_path = tmp.name

    low, high = 10, 95
    best_quality = high

    # Binary search for ~2 MB
    while low <= high:
        mid = (low + high) // 2
        img.save(temp_path, "JPEG", quality=mid, optimize=True, exif=exif_data)

        size = os.path.getsize(temp_path)
        if size > TARGET_SIZE_BYTES:
            high = mid - 1
        else:
            best_quality = mid
            low = mid + 1

    # Final save
    img.save(temp_path, "JPEG", quality=best_quality, optimize=True, exif=exif_data)

    # Restore filesystem timestamps
    os.utime(temp_path, original_times)

    # Atomically replace original
    shutil.move(temp_path, jpg_path)

def main():
    folder = "images/gallerie4"

    for name in os.listdir(folder):
        if name.lower().endswith((".jpg", ".jpeg")):
            path = os.path.join(folder, name)
            compress_in_place(path)

            size_mb = os.path.getsize(path) / (1024 * 1024)
            print(f"{name}: {size_mb:.2f} MB")

if __name__ == "__main__":
    main()