import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import test from 'node:test';
import {build} from 'vite';
import {formats} from '@elysium/contracts';
import {contractRuntime} from '../plugins/contract-runtime.ts';
import {offline} from '../plugins/offline.ts';

test('prebuilt contract runtime keeps native validation in client, worker and offline shell',async()=>{
  const parent=await realpath(tmpdir()),temporary=await mkdtemp(path.join(parent,'neonei-contract-runtime-'));
  try{
    const root=path.join(temporary,'frontend'),output=path.join(temporary,'output');
    const files={
      'package.json':'{"type":"module"}','package-lock.json':'{}','catalog/package.json':'{}',
      'catalog/src/index.ts':'export {};','frontend/package.json':'{"type":"module"}',
      'frontend/vite.config.ts':'export default {};','frontend/plugins/input.ts':'export {};',
      'frontend/index.html':'<script type="module" src="/src/main.ts"></script>',
      'frontend/src/main.ts':`import {canonical,assertTable} from '@elysium/contracts';
        globalThis.validation=[canonical({b:2,a:1}),typeof assertTable];
        new Worker(new URL("./worker.ts",import.meta.url),{type:"module"});`,
      'frontend/src/worker.ts':`import {assertTable} from '@elysium/contracts';self.postMessage(typeof assertTable);`,
      'frontend/src/offline/service.ts':'globalThis.testShell=__SHELL__;',
      'frontend/public/placeholder.png':'p','frontend/public/placeholder-fluid.png':'f',
      'frontend/public/fonts/test.woff2':'font','frontend/public/sounds/test.mp3':'sound',
      'frontend/public/textures/test.png':'image','frontend/public/native/test.json':'{}',
    };
    for(const [name,contents]of Object.entries(files)){
      const target=path.join(temporary,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,contents);
    }
    const project=fileURLToPath(new URL('../../',import.meta.url));
    const result=await build({root,configFile:false,logLevel:'silent',
      plugins:[contractRuntime(project),offline(root)],worker:{format:'es',plugins:()=>[contractRuntime(project,true)]},
      build:{outDir:output,minify:false,copyPublicDir:false,assetsDir:'web'}});
    const runtimes=result.output.filter(file=>/^web\/contracts-[0-9a-f]{64}\.js$/.test(file.fileName));
    assert.equal(runtimes.length,1,'client and worker share only the current opaque runtime');
    assert.ok(runtimes.every(file=>file.type==='asset'),'Rollup must not parse generated validator ASTs');
    const main=result.output.find(file=>file.type==='chunk'&&file.isEntry);
    assert.ok(main.code.length<10000,'client entry unexpectedly contains generated validators');
    for(const file of runtimes){
      const bytes=await readFile(path.join(output,file.fileName));
      assert.equal(file.fileName,`web/contracts-${createHash('sha256').update(bytes).digest('hex')}.js`);
    }
    const modules=await Promise.all(runtimes.map(file=>import(pathToFileURL(path.join(output,file.fileName)).href)));
    const current=modules.find(module=>module.formats.catalog.revision===formats.catalog.revision);
    assert.ok(current);assert.equal(current.canonical({b:2,a:1}),'{"a":1,"b":2}');
    const fixture=JSON.parse(await readFile(new URL('../../../elysium-compiler/contracts/fixtures/botania-native-pool-0-contract.json',import.meta.url),'utf8'));
    current.assertTable({kind:'recipes',records:[fixture.recipe]});
    const invalid=structuredClone(fixture.recipe);invalid.process.index='0';
    assert.throws(()=>current.assertTable({kind:'recipes',records:[invalid]}),/invalid/i);
    const shell=await readFile(path.join(output,'sw.js'),'utf8');
    for(const file of runtimes)assert.ok(shell.includes('/'+file.fileName),'offline shell lost native validation');
    const worker=result.output.find(file=>/^web\/worker-.*\.js$/.test(file.fileName));
    assert.ok(worker&&Buffer.from(worker.source).toString().includes('/web/contracts-'),'worker lost contract runtime import');
  }finally{
    assert.equal(path.dirname(await realpath(temporary)),parent);
    assert.ok(path.basename(temporary).startsWith('neonei-contract-runtime-'));
    await rm(temporary,{recursive:true});
  }
});
