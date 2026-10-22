"""CPU-only BGE text inference, with no image or remote Python code loader.

Uses the same quantized model, CLS pooling and normalization as the former
FastEmbed BAAI/bge-small-en-v1.5 path. The immutable model revision keeps new
vectors compatible with the existing 384-dimensional database vectors.
"""
from __future__ import annotations

import json
from itertools import islice
from pathlib import Path
from typing import Iterable, Iterator

import numpy as np
import onnxruntime as ort
from huggingface_hub import snapshot_download
from tokenizers import AddedToken, Tokenizer

MODEL_NAME = "BAAI/bge-small-en-v1.5"
MODEL_REPOSITORY = "Qdrant/bge-small-en-v1.5-onnx-Q"
MODEL_REVISION = "aa8f8b060edb00e03bfdd08813a2949946c8ba55"
MODEL_FILES = ["model_optimized.onnx", "tokenizer.json", "tokenizer_config.json",
               "special_tokens_map.json", "config.json"]


class BgeTextEmbedding:
    def __init__(self, model_name: str = MODEL_NAME, cache_dir: str | None = None):
        if model_name != MODEL_NAME:
            raise ValueError("Only the configured BGE text model is supported")
        self.model_dir = Path(snapshot_download(
            repo_id=MODEL_REPOSITORY, revision=MODEL_REVISION,
            allow_patterns=MODEL_FILES, cache_dir=cache_dir,
        ))
        config = json.loads((self.model_dir / "tokenizer_config.json").read_text())
        self.tokenizer = Tokenizer.from_file(str(self.model_dir / "tokenizer.json"))
        # This pinned BGE model has a 512-token right-truncated context.
        if config.get("model_max_length") != 512:
            raise ValueError("Unexpected BGE tokenizer context")
        self.tokenizer.enable_truncation(max_length=512, direction="right")
        special = json.loads((self.model_dir / "special_tokens_map.json").read_text())
        for value in special.values():
            for token in value if isinstance(value, list) else [value]:
                self.tokenizer.add_special_tokens([
                    AddedToken(**token) if isinstance(token, dict) else token
                ])
        pad_id = self.tokenizer.token_to_id("[PAD]")
        if pad_id is None:
            raise ValueError("BGE padding token is missing")
        self.tokenizer.enable_padding(pad_id=pad_id, pad_token="[PAD]", direction="right")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(
            str(self.model_dir / "model_optimized.onnx"), sess_options=options,
            providers=["CPUExecutionProvider"],
        )
        self.input_names = {item.name for item in self.session.get_inputs()}
        if not self.input_names <= {"input_ids", "attention_mask", "token_type_ids"}:
            raise ValueError("Unexpected BGE model inputs")

    def embed(self, documents: str | Iterable[str], batch_size: int = 64) -> Iterator[np.ndarray]:
        if not 1 <= batch_size <= 64:
            raise ValueError("Embedding batches must contain 1 to 64 texts")
        iterator = iter([documents] if isinstance(documents, str) else documents)
        while batch := list(islice(iterator, batch_size)):
            if any(not isinstance(text, str) for text in batch):
                raise TypeError("Embedding input must be text")
            encoded = self.tokenizer.encode_batch(batch)
            ids = np.asarray([item.ids for item in encoded], dtype=np.int64)
            inputs = {"input_ids": ids,
                      "attention_mask": np.asarray([item.attention_mask for item in encoded], dtype=np.int64),
                      "token_type_ids": np.zeros_like(ids)}
            output = self.session.run(None, {key: inputs[key] for key in self.input_names})[0]
            if output.ndim == 3:
                output = output[:, 0]
            if output.shape != (len(batch), 384) or not np.isfinite(output).all():
                raise ValueError("Invalid BGE embedding output")
            normalized = output / np.maximum(np.linalg.norm(output, axis=1, keepdims=True), 1e-12)
            yield from normalized.astype(np.float32)
