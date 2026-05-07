from pathlib import Path
import numpy as np
import tifffile
from PIL import Image
import scipy.ndimage as ndi
from skimage.filters import threshold_otsu
from skimage.segmentation import watershed
from skimage.feature import peak_local_max
from skimage.morphology import disk, dilation as sk_dilation

BACKEND_DIR = Path(__file__).parent
TIF_PREFIX = "AS_09047_050428030001_"
TIF_DIR = BACKEND_DIR / "static" / "images"
PROCESSED_DIR = BACKEND_DIR / "static" / "images" / "processed"

PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

_CELL_DISK = disk(8)


def get_tif_paths(well_index: int) -> tuple[Path, Path]:
    base = TIF_PREFIX + f"O{well_index:02d}f00"
    return TIF_DIR / f"{base}d0.TIF", TIF_DIR / f"{base}d2.TIF"


def normalize_channel(arr: np.ndarray) -> np.ndarray:
    p2, p98 = np.percentile(arr, 2), np.percentile(arr, 98)
    if p98 == p2:
        return np.zeros_like(arr, dtype=np.uint8)
    clipped = np.clip(arr, p2, p98)
    scaled = (clipped - p2) / (p98 - p2) * 255
    return scaled.astype(np.uint8)


def compute_transfection_rate(hoechst_arr: np.ndarray, gfp_arr: np.ndarray) -> float:
    """
    Per-nucleus GFP intensity classification:
    Otsu + watershed segmentation on Hoechst → per-nucleus dilated region → mean GFP →
    median + 2×MAD threshold → GFP+ fraction. More robust than blob counting against
    adjacent/split nuclei artifacts.
    """
    thresh = threshold_otsu(hoechst_arr)
    nuclei_mask = hoechst_arr > thresh
    distance = ndi.distance_transform_edt(nuclei_mask)
    coords = peak_local_max(distance, min_distance=10, labels=nuclei_mask)
    marker_arr = np.zeros(distance.shape, dtype=bool)
    marker_arr[tuple(coords.T)] = True
    markers, _ = ndi.label(marker_arr)
    nuclei_labels = watershed(-distance, markers, mask=nuclei_mask)

    unique_labels = [label_id for label_id in np.unique(nuclei_labels) if label_id != 0]
    total_nuclei = len(unique_labels)
    if total_nuclei == 0:
        return 0.0

    gfp_float = gfp_arr.astype(np.float32)
    mean_gfp_values = []
    for label_id in unique_labels:
        nucleus_mask = nuclei_labels == label_id
        cell_region = sk_dilation(nucleus_mask, _CELL_DISK)
        mean_gfp_values.append(gfp_float[cell_region].mean())

    mean_gfp_arr = np.array(mean_gfp_values)
    median_val = np.median(mean_gfp_arr)
    mad = np.median(np.abs(mean_gfp_arr - median_val))
    threshold = median_val + 2.0 * mad

    gfp_positive = int(np.sum(mean_gfp_arr > threshold))
    return float(np.clip(gfp_positive / total_nuclei, 0.0, 1.0))


def process_experiment(well_index: int, exp_id: str) -> dict:
    hoechst_path, gfp_path = get_tif_paths(well_index)
    hoechst_raw = tifffile.imread(hoechst_path)
    gfp_raw = tifffile.imread(gfp_path)

    hoechst_norm = normalize_channel(hoechst_raw)
    gfp_norm = normalize_channel(gfp_raw)

    rate = compute_transfection_rate(hoechst_norm, gfp_norm)

    png_filename = f"{exp_id}_gfp.png"
    Image.fromarray(gfp_norm).save(PROCESSED_DIR / png_filename)

    return {
        "transfection_rate": rate,
        "gfp_png_path": f"/static/images/processed/{png_filename}",
    }
