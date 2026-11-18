"""Local Florence-2 MLX backend for Sketchy's photo labeling.

Protocol: one JSON request per stdin line; one JSON response per stdout line.
Diagnostics go to stderr. The model stays resident for repeated labels.
"""
import contextlib
import json
import os
import subprocess
import sys
import traceback
from pathlib import Path


def download(repo: str, dest: str) -> None:
    from huggingface_hub import snapshot_download
    snapshot_download(repo_id=repo, local_dir=dest, ignore_patterns=["*.md", ".gitattributes"])
    print(json.dumps({"ready": True, "path": dest}), flush=True)


def serve(path: str) -> None:
    from PIL import Image
    from mlx_vlm import generate, load
    from mlx_vlm.prompt_utils import apply_chat_template
    from mlx_vlm.utils import load_config

    # Keep stdout reserved for JSON; library progress/reporting goes to stderr.
    with contextlib.redirect_stdout(sys.stderr):
        model, processor = load(path)
        config = load_config(path)
    print(json.dumps({"ready": True}), flush=True)

    for line in sys.stdin:
        if not line.strip():
            continue
        req_id = None
        try:
            req = json.loads(line)
            req_id = req.get("id")
            image_path = req["image"]
            task = req["task"]
            phrase = req.get("phrase", "")
            with Image.open(image_path) as im:
                size = im.size
            if task == "<OCR_WITH_REGION>":
                native_ocr = os.environ.get("SKETCHY_VISION_OCR", "")
                if native_ocr and os.path.isfile(native_ocr):
                    result = subprocess.run([native_ocr, image_path, str(size[0]), str(size[1])], capture_output=True, text=True, timeout=60)
                    if result.returncode == 0:
                        print(json.dumps({"id": req_id, "raw": "", "parsed": json.loads(result.stdout), "size": size}), flush=True)
                        continue
                    print("Apple Vision OCR failed: " + result.stderr, file=sys.stderr)
            prompt = task + phrase
            formatted = apply_chat_template(processor, config, prompt, num_images=1)
            with contextlib.redirect_stdout(sys.stderr):
                response = generate(
                    model, processor, formatted, [image_path],
                    max_tokens=512 if task == "<OCR_WITH_REGION>" else 256,
                    temp=0.0, verbose=False,
                )
            raw = response.text
            parsed = None
            if hasattr(processor, "post_process_generation"):
                try:
                    parsed = processor.post_process_generation(text=raw, task=task, image_size=size).get(task)
                except Exception as exc:
                    print(f"Post-processing failed; returning raw tokens: {exc}", file=sys.stderr)
            print(json.dumps({"id": req_id, "raw": raw, "parsed": parsed, "size": size}, default=str), flush=True)
        except Exception as exc:
            traceback.print_exc(file=sys.stderr)
            print(json.dumps({"id": req_id, "error": str(exc)}), flush=True)


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit("Usage: mlx_worker.py download REPO DEST | serve LOCAL_MODEL_DIR")
    if sys.argv[1] == "download" and len(sys.argv) == 4:
        download(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == "serve" and len(sys.argv) == 3:
        serve(sys.argv[2])
    else:
        raise SystemExit("Invalid command")
