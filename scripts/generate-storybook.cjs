'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),htmlPath=path.join(root,'index.html'),dir=path.join(root,'assets/illustrations/words'),manifestPath=path.join(root,'assets/illustrations/generated-manifest.json');
const scenesFile=path.join(root,'assets/illustrations/scene-descriptions.json');
const scenes=JSON.parse(fs.readFileSync(scenesFile,'utf8'));
const html=fs.readFileSync(htmlPath,'utf8'),data=html.match(/const DATA=(\[[^\n]+?\]);/);
if(!data)throw Error('Could not read DATA');const words=JSON.parse(data[1]);
if(new Set(words.map(r=>r[0].toLowerCase())).size!==words.length)throw Error('Duplicate word');
const manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):{version:1,images:{}};
manifest.images||={};
const model=process.env.IMAGE_MODEL||'gpt-image-1.5',qaModel=process.env.QA_MODEL||'gpt-4.1-mini';
const arg=process.argv.find(x=>x.startsWith('--limit='));
const max=Math.min(80,Math.max(1,Number(arg?arg.split('=')[1]:(process.env.BATCH_LIMIT||10))||10));
const dry=process.argv.includes('--dry-run'),force=process.argv.includes('--force');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const filename=w=>w.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.webp';
function prompt(w,m,scene){return 'Draw one premium 3:2 landscape storybook watercolor/gouache illustration. Word '+w+', Korean meaning '+m+'. Story: '+scene+'. Expressive illustrated characters, one visually obvious cause/effect action, sophisticated cozy storybook artwork with warm light, rich well-crafted details, pastel lavender/mint/peach, charming children picture-book painterly style. Keep main characters and props within safe center area. No typography, signs, icons, infographic, extra limbs, mixed scenes, overlays or watermarks.'}
function dimensions(b){
 if(b.length<32||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WEBP')throw Error('not WEBP');
 const t=b.toString('ascii',12,16);
 if(t==='VP8X')return [b.readUIntLE(24,3)+1,b.readUIntLE(27,3)+1];
 if(t==='VP8 ')return [b.readUInt16LE(26)&16383,b.readUInt16LE(28)&16383];
 if(t==='VP8L'){const v=b.readUInt32LE(21);return [(v&16383)+1,((v>>>14)&16383)+1]}
 throw Error('WebP encoding unsupported');
}
function valid(e,w,m,ph){
 if(!e||!e.approved||e.meaning!==m||e.promptHash!==ph)return false;
 const file=path.resolve(root,e.path||'');
 if(!file.startsWith(dir+path.sep)||!fs.existsSync(file))return false;
 try{let b=fs.readFileSync(file);return dimensions(b)[0]>=1024&&sha(b)===e.sha256}catch{return false}
}
async function api(endpoint,body){
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),180000);
 try{
  let r=await fetch('https://api.openai.com/v1/'+endpoint,{method:'POST',signal:ctl.signal,headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  let j=await r.json();if(!r.ok)throw Error('HTTP '+r.status+' '+JSON.stringify(j.error||{}).slice(0,250));return j;
 }finally{clearTimeout(timer)}
}
async function paint(p){
 const v=await api('images/generations',{model,prompt:p,size:'1536x1024',quality:'high',output_format:'webp',output_compression:85,n:1});
 if(!v.data?.[0]?.b64_json)throw Error('No image');return Buffer.from(v.data[0].b64_json,'base64');
}
async function review(w,m,scene,img){
 const v=await api('responses',{model:qaModel,input:[{role:'user',content:[
  {type:'input_text',text:'Art director quality review. Does the image clearly depict '+w+' = '+m+' by this story: '+scene+'? Reject confusing overlapping objects, extraneous hands, flat icons, typography, watermarks, unrelated scenes. Output raw JSON only in the form {"pass":true,"reason":"one sentence"} or {"pass":false,"reason":"one sentence"}. No markdown.'},
  {type:'input_image',image_url:'data:image/webp;base64,'+img.toString('base64')}
 ]}]});
 let text=(v.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||v.output_text||'';
 const o=JSON.parse(text.trim());return {pass:o.pass===true,reason:String(o.reason||'').slice(0,180)};
}
async function describeScene(w,m){
 const v=await api('responses',{model:qaModel,input:[{role:'user',content:[{
  type:'input_text',
  text:'You are an educational art director. For English word "'+w+'" with Korean meaning "'+m+'", invent ONE visually compelling, easy-to-remember picture book scene conveying this precise meaning. Output only 1 or 2 short English sentences describing characters, objects, actions and cause-and-effect. Be concrete and memorable, no labels, no text inside picture, no abstract infographic.'
 }]}]});
 const answer=(v.output||[]).flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||v.output_text||'';
 const result=answer.trim().replace(/\s+/g,' ').slice(0,500);
 if(result.length<30)throw Error('Scene analysis empty or too short for '+w);
 return result;
}
function sync(){
 const map={};for(const [w,e] of Object.entries(manifest.images)){
  const row=words.find(r=>r[0]===w);if(!row)continue;
  const ph=sha('v1|'+model+'|'+prompt(w,row[1],scenes[w]));
  if(valid(e,w,row[1],ph))map[w]=e.path+'?v='+e.sha256.slice(0,10);
 }
 const src=fs.readFileSync(htmlPath,'utf8'),re=/const STORYBOOK_GENERATED=\{[^\n]*\};/;
 if(!re.test(src))throw Error('Missing STORYBOOK_GENERATED mapping');
 const updated=src.replace(re,'const STORYBOOK_GENERATED='+JSON.stringify(map)+';');
 if(updated!==src)fs.writeFileSync(htmlPath,updated);
 return Object.keys(map).length;
}
async function main(){
 if(new Set(words.map(r=>filename(r[0]))).size!==words.length)throw Error('Image filename collision');
 for(const [w,m] of words){
  if(scenes[w])continue;
  if(dry){scenes[w]='[Scene will be automatically analyzed for this new word: '+m+']';continue}
  if(!process.env.OPENAI_API_KEY){console.log('New word '+w+': missing API key; retain SVG fallback');continue}
  const description=await describeScene(w,m);
  scenes[w]=description;
  fs.writeFileSync(scenesFile,JSON.stringify(scenes,null,2)+'\n');
  console.log('NEW SCENE '+w+': '+description);
 }
 const todo=[];for(const [w,m] of words){
  if(!scenes[w])continue;
  const p=prompt(w,m,scenes[w]),ph=sha('v1|'+model+'|'+p);
  if(force||!valid(manifest.images[w],w,m,ph))todo.push({w,m,p,ph});
 }
 console.log('Total '+words.length+'; pending '+todo.length+'; limit '+max);
 if(dry){todo.forEach(v=>console.log(v.w+' | '+scenes[v.w]));return}
 if(!process.env.OPENAI_API_KEY){console.log('No OPENAI_API_KEY secret. Skipping image generation safely.');return}
 fs.mkdirSync(dir,{recursive:true});
 const known=new Set(Object.values(manifest.images).map(e=>e.sha256).filter(Boolean));let count=0,failed=0;
 for(const item of todo.slice(0,max)){
  let result=null;
  for(let attempt=0;attempt<2;attempt++)try{
   const image=await paint(item.p+(attempt?' Clearer single scene, no clutter.':''));
   const [width,height]=dimensions(image),checksum=sha(image);
   if(width<1024||height<768||width/height<1.25||width/height>2.1||image.length<25000||image.length>9000000||known.has(checksum))throw Error('Image dimension/duplicate failed');
   const qa=await review(item.w,item.m,scenes[item.w],image);
   if(!qa.pass)throw Error('Semantic visual QA failed: '+qa.reason);
   result={image,width,height,checksum,qa};break;
  }catch(e){console.warn(item.w+' retry '+(attempt+1)+': '+e.message)}
  if(!result){failed++;continue}
  const rel='assets/illustrations/words/'+filename(item.w);
  fs.writeFileSync(path.join(root,rel),result.image);
  manifest.images[item.w]={word:item.w,meaning:item.m,path:rel,promptHash:item.ph,sha256:result.checksum,width:result.width,height:result.height,approved:true,review:result.qa.reason,model,createdAt:new Date().toISOString()};
  known.add(result.checksum);count++;
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  sync();console.log('OK '+item.w+' '+result.width+'x'+result.height);
 }
 fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 console.log('Finished '+count+' approved, '+failed+' failed, '+sync()+' mapped.');
 if(failed&&!count)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
