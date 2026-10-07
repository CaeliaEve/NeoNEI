import hashlib, importlib.util, json, tempfile, unittest
from pathlib import Path
from PIL import Image

class VisualPackTest(unittest.TestCase):
    def test_large_native_frames_keep_every_rgba_pixel(self):
        file=Path(__file__).with_name('recipe-visuals.py')
        self.assertTrue(file.exists(), 'native recipe art packer missing')
        spec=importlib.util.spec_from_file_location('visuals',file)
        module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source=Image.new('RGBA',(800,800),(17,29,31,0))
            source.paste((220,10,40,171),(11,12,400,620)); source.save(root/'source.png')
            raw=(root/'source.png').read_bytes(); out=root/'out'; out.mkdir()
            plan={'catalog':'a'*64,'root':str(root),'files':[{'path':'source.png','sha256':hashlib.sha256(raw).hexdigest()}],
                  'frames':[{'path':'source.png','x':7,'y':9,'width':512,'height':628}, {'path':'source.png','x':5,'y':6,'width':16,'height':16}]}
            module.build(plan,out)
            manifest=json.loads((out/'manifest.json').read_text()); mapping=json.loads((out/'mapping.json').read_text())
            self.assertEqual(len(mapping['frames']),2)
            for row in mapping['frames']:
                _,x,y,w,h,page,dx,dy=row
                with Image.open(out/manifest['files'][page]['path']) as decoded:
                    self.assertEqual(decoded.convert('RGBA').crop((dx,dy,dx+w,dy+h)).tobytes(),source.crop((x,y,x+w,y+h)).tobytes())

if __name__=='__main__': unittest.main()
