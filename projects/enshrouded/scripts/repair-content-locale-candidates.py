"""Retry audited supplementary prose individually, retaining source-bound caches.

This does not approve or suppress findings. Rebuild and run the full audit after
the retry; any unchanged English prose still requires contextual review.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("builder", ROOT / "scripts/build-content-locales.py")
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--languages", required=True)
    args = parser.parse_args()
    status = builder.read(builder.RESEARCH / "status.json")
    source = builder.read(builder.RESEARCH / "content-translation-source.json")
    rows = {row["key"]: row for row in source["rows"]}
    if status["content"]["sourceSha256"] != source["sourceSha256"]:
        raise ValueError("Run a current audit before retrying")
    for code in args.languages.split(","):
        pack = status["content"]["packs"][code]
        if not pack.get("aligned"):
            raise ValueError(f"The audited pack is stale: {code}")
        candidates = pack.get("reviewCandidates", [])
        path = Path(tempfile.gettempdir()) / "enshrouded-localization-cache" / f"{code}.json"
        cache = builder.read(path)
        failures = []
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = {pool.submit(builder.translator.translate_chunk, code,
                                   [(entry["key"], rows[entry["key"]]["template"])], True): entry["key"]
                       for entry in candidates}
            for future in as_completed(futures):
                key = futures[future]
                try:
                    value = future.result()[key]
                    cache["values"][key] = {"templateSha256": hashlib.sha256(rows[key]["template"].encode()).hexdigest(),
                                            "translation": value}
                    builder.atomic_json(path, cache)
                except Exception as error:
                    failures.append({"key": key, "error": str(error)})
        print(f"{code}: retried {len(candidates)} audited strings; failures {len(failures)}", flush=True)
        builder.atomic_json(builder.RESEARCH / "content-drafts" / f"{code.lower()}-quality-retry.json",
                            {"sourceSha256": source["sourceSha256"], "retried": len(candidates), "failures": failures})


if __name__ == "__main__":
    main()
