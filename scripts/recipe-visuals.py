"""Pack native recipe view art into small PNG pages, verifying every RGBA pixel."""
import hashlib, io, json, sys
from pathlib import Path
from PIL import Image

def build(plan,out):
    out=Path(out); (out/'textures').mkdir(exist_ok=True)
    declared={f['path']:f for f in plan['files']}; paths=list(dict.fromkeys(f['path'] for f in plan['frames']))
    files=[]; mapping=[]; audited=0
    for source_index,path in enumerate(paths):
        data=(Path(plan['root'])/path).read_bytes()
        assert hashlib.sha256(data).hexdigest()==declared[path]['sha256'], 'Source hash mismatch'
        entries=sorted((f for f in plan['frames'] if f['path']==path),key=lambda f:(-f['height'],-f['width'],f['y'],f['x']))
        with Image.open(io.BytesIO(data)) as opened:
            source=opened.convert('RGBA'); page=Image.new('RGBA',(1024,1024)); x=y=row_height=0; placed=[]
            def flush():
                nonlocal page,placed,audited
                if not placed:return
                encoded=io.BytesIO();page.save(encoded,'PNG',compress_level=6)
                blob=encoded.getvalue();digest=hashlib.sha256(blob).hexdigest();name='textures/'+digest+'.png'
                (out/name).write_bytes(blob); index=len(files);files.append({'kind':'image','path':name,'bytes':len(blob),'sha256':digest})
                with Image.open(io.BytesIO(blob)) as decoded:
                    for f,dx,dy in placed:
                        sx,sy,w,h=f['x'],f['y'],f['width'],f['height']
                        assert decoded.crop((dx,dy,dx+w,dy+h)).tobytes()==source.crop((sx,sy,sx+w,sy+h)).tobytes(),'RGBA mismatch'
                        mapping.append([source_index,sx,sy,w,h,index,dx,dy]);audited+=1
                page.close();page=Image.new('RGBA',(1024,1024));placed=[]
            for f in entries:
                w,h=f['width'],f['height'];sx,sy=f['x'],f['y']
                assert 0<w<=1024 and 0<h<=1024 and min(sx,sy)>=0 and sx+w<=source.width and sy+h<=source.height,'Frame out of bounds'
                if x+w>1024: x=0;y+=row_height;row_height=0
                if y+h>1024:flush();x=y=row_height=0
                page.paste(source.crop((sx,sy,sx+w,sy+h)),(x,y));placed.append((f,x,y));x+=w;row_height=max(row_height,h)
            flush();page.close();source.close()
        if source_index%20==0:print(f'{source_index+1}/{len(paths)} source atlases; {audited} frames verified',flush=True)
    payload=json.dumps({'paths':paths,'frames':mapping},separators=(',',':')).encode();(out/'mapping.json').write_bytes(payload)
    manifest={'version':1,'catalog':plan['catalog'],'files':files,'mapping':{'path':'mapping.json','bytes':len(payload),'sha256':hashlib.sha256(payload).hexdigest()}}
    (out/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')),encoding='utf-8')
    audit={'frames':audited,'resampled':0,'rgbaMismatches':0,'pages':len(files),'bytes':sum(f['bytes'] for f in files)}
    (out/'pixel-audit.json').write_text(json.dumps(audit),encoding='utf-8'); print(json.dumps(audit),flush=True)

if __name__=='__main__':
    directory=Path(sys.argv[1]);build(json.loads((directory/'plan.json').read_text(encoding='utf-8')),directory)
