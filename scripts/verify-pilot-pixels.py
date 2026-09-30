"""Decode native RGBA before browser premultiplication; Pillow is required."""
import hashlib
import json
import sys
from pathlib import Path
from PIL import Image

spec = json.load(sys.stdin)
source = Image.open(spec['sourcePath']).convert('RGBA')
pages = {}
results = []
try:
    for index, frame in enumerate(spec['texture']['frames']):
        if frame['path'] not in pages:
            pages[frame['path']] = Image.open(Path(spec['atlasRoot']) / frame['path']).convert('RGBA')
        sf = spec['asset']['frames'][index] if spec['asset']['frames'] else dict(x=0, y=0, width=source.width, height=source.height)
        def crop(image, f):
            return image.crop((f['x'], f['y'], f['x'] + f['width'], f['y'] + f['height'])).tobytes()
        a, b = crop(source, sf), crop(pages[frame['path']], frame)
        results.append({'frame': index, 'sourceSha256': hashlib.sha256(a).hexdigest(),
                        'atlasSha256': hashlib.sha256(b).hexdigest(), 'equal': a == b})
finally:
    source.close()
    for image in pages.values():
        image.close()
print(json.dumps({'frames': results}))
sys.exit(0 if all(row['equal'] for row in results) else 1)
