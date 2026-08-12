# fine_tune_wav2vec2.py
"""
Fine-tune wav2vec2 for SA accents using AfriSpeech-200 or custom dataset.
Assumptions:
 - Dataset stored as Hugging Face Dataset with columns: "audio" (path or dict with 'array','sampling_rate'), "transcript"
 - Use CTC loss
 - Use accelerate for multi-GPU
"""

import os
import re
import torch
from dataclasses import dataclass, field
from typing import Optional
from datasets import load_dataset, load_metric, DatasetDict
from transformers import (Wav2Vec2Processor, Wav2Vec2ForCTC, TrainingArguments,
                          Trainer, DataCollatorCTCWithPadding)
import numpy as np

# ---- Config ----
DATASET_NAME = os.getenv("FT_DATASET_NAME", "intron/afrispeech-200")  # or path to local dataset
OUTPUT_DIR = os.getenv("FT_OUTPUT_DIR", "./wav2vec2-afri")
MODEL_NAME = os.getenv("FT_BASE_MODEL", "facebook/wav2vec2-xls-r-300m")
LANGUAGE = "en"
SAMPLE_RATE = 16000
PER_DEVICE_BATCH = int(os.getenv("FT_BATCH", "8"))
EPOCHS = int(os.getenv("FT_EPOCHS", "5"))

# ---- Helpers ----
def remove_special_characters(batch):
    text = batch["transcript"].lower()
    # basic cleanup (customize for your transcripts)
    text = re.sub(r"[^a-z0-9\s']", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    batch["text_clean"] = text
    return batch

def speech_file_to_array_fn(batch):
    speech_array = batch["audio"]["array"] if isinstance(batch["audio"], dict) else batch["audio"]
    sampling_rate = batch["audio"]["sampling_rate"] if isinstance(batch["audio"], dict) else SAMPLE_RATE
    batch["speech"] = speech_array
    batch["sampling_rate"] = sampling_rate
    return batch

# Load dataset
raw_datasets = load_dataset(DATASET_NAME)
# Some datasets have 'train','validation' splits. Ensure they exist.
if "validation" not in raw_datasets:
    raw_datasets = raw_datasets.train_test_split(test_size=0.05)

# Preprocess
raw_datasets = raw_datasets.map(speech_file_to_array_fn, remove_columns=[c for c in raw_datasets["train"].column_names if c not in ("audio","transcript")], num_proc=4)
raw_datasets = raw_datasets.map(remove_special_characters, num_proc=4)

# Processor (tokenizer + feature extractor)
processor = Wav2Vec2Processor.from_pretrained(MODEL_NAME)

def prepare_dataset(batch):
    # resample if needed, then tokenize
    audio = batch["speech"]
    if batch["sampling_rate"] != SAMPLE_RATE:
        import librosa
        audio = librosa.resample(np.array(audio), orig_sr=batch["sampling_rate"], target_sr=SAMPLE_RATE)
    batch["input_values"] = processor(audio, sampling_rate=SAMPLE_RATE).input_values[0]
    with processor.as_target_processor():
        batch["labels"] = processor(batch["text_clean"]).input_ids
    return batch

prepared_datasets = raw_datasets.map(prepare_dataset, remove_columns=raw_datasets["train"].column_names, num_proc=4)

# Load model
model = Wav2Vec2ForCTC.from_pretrained(MODEL_NAME)
model.freeze_feature_extractor()  # freeze conv layers initially

# Data collator
data_collator = DataCollatorCTCWithPadding(processor=processor, padding=True)

# Metrics
wer_metric = load_metric("wer")

def compute_metrics(pred):
    pred_logits = pred.predictions
    pred_ids = np.argmax(pred_logits, axis=-1)
    pred_str = processor.batch_decode(pred_ids)
    label_ids = pred.label_ids
    # replace -100
    label_ids[label_ids == -100] = processor.tokenizer.pad_token_id
    label_str = processor.batch_decode(label_ids, group_tokens=False)
    wer_score = wer_metric.compute(predictions=pred_str, references=label_str)
    return {"wer": wer_score}

# Training args
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    per_device_train_batch_size=PER_DEVICE_BATCH,
    per_device_eval_batch_size=PER_DEVICE_BATCH,
    gradient_accumulation_steps=2,
    evaluation_strategy="steps",
    num_train_epochs=EPOCHS,
    fp16=torch.cuda.is_available(),
    save_steps=1000,
    eval_steps=500,
    logging_steps=100,
    learning_rate=1e-4,
    warmup_steps=500,
    save_total_limit=3,
    report_to="wandb" if os.getenv("WANDB_API_KEY") else None
)

trainer = Trainer(
    model=model,
    data_collator=data_collator,
    args=training_args,
    compute_metrics=compute_metrics,
    train_dataset=prepared_datasets["train"],
    eval_dataset=prepared_datasets.get("validation", prepared_datasets["test"]),
    tokenizer=processor.feature_extractor  # required placeholder
)

if __name__ == "__main__":
    trainer.train()
    trainer.save_model(OUTPUT_DIR)
    processor.save_pretrained(OUTPUT_DIR)
    print("Fine-tuning complete. Model saved to", OUTPUT_DIR)
