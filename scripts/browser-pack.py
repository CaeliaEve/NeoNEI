"""Build lossless native-resolution browsing pages from a verified Catalog plan."""
import hashlib, io, json, math, mmap, sys, tempfile
from pathlib import Path
from PIL import Image

out=Path(sys.argv[1]); plan=json.loads((out/'plan.json').read_text(encoding='utf-8'))
size=64; edge=1024; per=(edge//size)**2; page_bytes=edge*edge*4
files=[]; frames=plan['frames']; dimensions=[[f['width'],f['height']] for f in frames]
declared={f['path']:f for f in plan['files']}; by_path={}; hashes=[None]*len(frames)
for i,f in enumerate(frames): by_path.setdefault(f['path'],[]).append((i,f))
(out/'textures').mkdir(exist_ok=True)
# File-backed scratch keeps native pixels lossless without retaining every decoded source atlas.
with tempfile.TemporaryFile(dir=out) as scratch:
    scratch.truncate(max(1,math.ceil(len(frames)/per))*page_bytes)
    with mmap.mmap(scratch.fileno(),0) as raw:
        for n,(path,entries) in enumerate(by_path.items()):
            data=(Path(plan['root'])/path).read_bytes()
            assert hashlib.sha256(data).hexdigest()==declared[path]['sha256']
            with Image.open(io.BytesIO(data)) as opened:
                image=opened.convert('RGBA')
                for i,f in entries:
                    w,h=f['width'],f['height']; assert 0<w<=size and 0<h<=size, 'Native frame exceeds cell size; never downsample'
                    pixels=image.crop((f['x'],f['y'],f['x']+w,f['y']+h)).tobytes();hashes[i]=hashlib.sha256(pixels).digest()
                    cell=i%per;x=cell%(edge//size)*size;y=cell//(edge//size)*size
                    start=i//per*page_bytes+(y*edge+x)*4
                    for row in range(h):raw[start+row*edge*4:start+row*edge*4+w*4]=pixels[row*w*4:(row+1)*w*4]
                image.close()
            if n%20==0: print(f'{n}/{len(by_path)} original atlases copied without resampling',flush=True)
        audited=0
        for page_index in range(math.ceil(len(frames)/per)):
            page=Image.frombytes('RGBA',(edge,edge),raw[page_index*page_bytes:(page_index+1)*page_bytes])
            encoded=io.BytesIO();page.save(encoded,'WEBP',lossless=True,exact=True,method=3);page.close()
            data=encoded.getvalue();digest=hashlib.sha256(data).hexdigest();name='textures/'+digest+'.webp'
            (out/name).write_bytes(data);files.append({'kind':'image','path':name,'bytes':len(data),'sha256':digest})
            with Image.open(io.BytesIO(data)) as decoded:
                decoded=decoded.convert('RGBA')
                for cell,f in enumerate(frames[page_index*per:(page_index+1)*per]):
                    x=cell%(edge//size)*size;y=cell//(edge//size)*size;w,h=f['width'],f['height']
                    assert hashlib.sha256(decoded.crop((x,y,x+w,y+h)).tobytes()).digest()==hashes[page_index*per+cell], 'Pixel mismatch'
                    audited+=1
            if page_index%40==0:print(f'{audited}/{len(frames)} native frames verified',flush=True)
index=(out/'index.json').read_bytes()
paths=list(dict.fromkeys(f['path'] for f in frames)); path_ids={p:i for i,p in enumerate(paths)}
original=json.dumps({'paths':paths,'frames':[[path_ids[f['path']],f['x'],f['y'],f['width'],f['height']] for f in frames]},separators=(',',':')).encode()
(out/'original-frames.json').write_bytes(original)
manifest={'version':2,'catalog':plan['catalog'],'size':size,'edge':edge,'count':len(dimensions),'dimensions':dimensions,'index':{'path':'index.json','bytes':len(index),'sha256':hashlib.sha256(index).hexdigest()},'files':files}
manifest['originalFrames']={'path':'original-frames.json','bytes':len(original),'sha256':hashlib.sha256(original).hexdigest()}
(out/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')),encoding='utf-8')
(out/'pixel-audit.json').write_text(json.dumps({'frames':audited,'mismatches':0,'resampled':0,'files':len(files),'imageBytes':sum(f['bytes'] for f in files)}),encoding='utf-8')
print((out/'pixel-audit.json').read_text(),flush=True)
