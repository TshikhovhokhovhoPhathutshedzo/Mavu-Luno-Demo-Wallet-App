# eval_testset.py
"""
Evaluation script to compute WER on a small test set.
Place test audios in a folder and provide a JSON lines file mapping audio -> reference transcript.
Format for manifest.jsonl:
{"audio_filepath": "/path/file1.wav", "transcript": "reference text"}
"""

import json
import sys
from tqdm import tqdm
from jiwer import wer
from enhanced_pipeline import transcribe  # reuse pipeline's transcriber

def evaluate(manifest_path):
    results = []
    total_ref = []
    total_pred = []
    with open(manifest_path, "r", encoding="utf8") as fh:
        for line in fh:
            obj = json.loads(line.strip())
            audio = obj["audio_filepath"]
            ref = obj["transcript"].lower().strip()
            pred = transcribe(audio).lower().strip()
            w = wer(ref, pred)
            results.append({"audio": audio, "ref": ref, "pred": pred, "wer": w})
            total_ref.append(ref)
            total_pred.append(pred)
    overall = wer(" ".join(total_ref), " ".join(total_pred))
    # Print summary
    print("Overall WER:", overall)
    for r in results:
        print(f"{r['audio']} | WER: {r['wer']:.3f} | REF: {r['ref']} | PRED: {r['pred']}")
    return results

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python eval_testset.py manifest.jsonl")
        sys.exit(1)
    evaluate(sys.argv[1])
