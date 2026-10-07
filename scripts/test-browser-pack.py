import hashlib, json, subprocess, sys, tempfile, unittest
from pathlib import Path
from PIL import Image

class NativePackTest(unittest.TestCase):
    def test_pack_keeps_every_source_pixel(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); output=root/'pack'; output.mkdir()
            source=Image.new('RGBA',(96,64))
            source.putdata([(x%256,y%256,(x*7+y*13)%256,255) for y in range(64) for x in range(96)])
            source.save(root/'source.png'); data=(root/'source.png').read_bytes()
            frames=[{'path':'source.png','x':0,'y':0,'width':64,'height':64}, {'path':'source.png','x':64,'y':0,'width':16,'height':16}]
            (output/'index.json').write_text('{}')
            (output/'plan.json').write_text(json.dumps({'root':str(root),'catalog':'test','frames':frames,'files':[{'path':'source.png','bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}]}))
            subprocess.run([sys.executable,str(Path(__file__).with_name('browser-pack.py')),str(output)],check=True,capture_output=True)
            manifest=json.loads((output/'manifest.json').read_text())
            self.assertEqual(manifest['size'],64,'Browser pack must not downsample 64px source icons')
            with Image.open(output/manifest['files'][0]['path']) as packed:
                self.assertEqual(packed.convert('RGBA').crop((0,0,64,64)).tobytes(),source.crop((0,0,64,64)).tobytes())
                self.assertEqual(packed.convert('RGBA').crop((64,0,80,16)).tobytes(),source.crop((64,0,80,16)).tobytes())

if __name__=='__main__': unittest.main()
