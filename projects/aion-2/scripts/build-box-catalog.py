"""Rebuild the curated box catalog from the published reference data."""
import argparse
import importlib
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent / 'reference-data'))
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--public', default='public')
args = parser.parse_args()
catalog = importlib.import_module('box-catalog').publish(args.public)
print(f"Box catalog: {len(catalog['families'])} families; "
      f"{sum(not f['technical'] for f in catalog['families'])} reader-facing")
