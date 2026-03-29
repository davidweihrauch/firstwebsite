import os
from PIL import Image, ImageOps

# === CONFIG ===
INPUT_DIR = "images/gallerie4"
OUTPUT_DIR = "images/gallerie4_comp"
TARGET_SIZE_MB = 2
TARGET_SIZE_BYTES = TARGET_SIZE_MB * 1024 * 1024

os.makedirs(OUTPUT_DIR, exist_ok=True)

def compress_to_target_size(input_path, output_path, target_size):
    img = Image.open(input_path)

    # Read EXIF data (includes date + orientation)
    exif_data = img.info.get("exif")

    # Normalize orientation (rotate pixels correctly)
    img = ImageOps.exif_transpose(img)

    # JPEG requires RGB
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    low, high = 10, 95
    best_quality = high

    # Binary search for quality
    while low <= high:
        mid = (low + high) // 2

        img.save(
            output_path,
            "JPEG",
            quality=mid,
            optimize=True,
            exif=exif_data
        )

        size = os.path.getsize(output_path)

        if size > target_size:
            high = mid - 1
        else:
            best_quality = mid
            low = mid + 1

    # Final save at best quality
    img.save(
        output_path,
        "JPEG",
        quality=best_quality,
        optimize=True,
        exif=exif_data
    )

def main():
    for filename in os.listdir(INPUT_DIR):
        if filename.lower().endswith((".jpg", ".jpeg")):
            input_path = os.path.join(INPUT_DIR, filename)
            output_path = os.path.join(OUTPUT_DIR, filename)

            compress_to_target_size(input_path, output_path, TARGET_SIZE_BYTES)

            final_size = os.path.getsize(output_path) / (1024 * 1024)
            print(f"{filename}: {final_size:.2f} MB")

if __name__ == "__main__":
    main()