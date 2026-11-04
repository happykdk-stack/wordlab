'use strict';
/* WordLab Stories: server-side generation only. Never expose the API key in browser assets. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),STORIES=path.join(root,'assets/wordlab-stories.js');
const themes=['고객 응대','글로벌 회의','문제 해결','프로젝트','데이터 분석','리더십','일상 영어'];
const key=s=>String(s).trim().toLowerCase();
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const limit=Math.max(1,Math.min(14,Number(process.env.WORDLAB_STORY_MAX_DAYS||4)))*2;
function loadStories(source){
 const m=source.match(/^window\.WORDLAB_STORIES=(\[[^\n]*\]);?\s*$/m);
 if(!m)throw Error('Story file format has changed; stop rather than overwrite');
 return {original:m[0],stories:JSON.parse(m[1])};
}
function getWords(html){
 const m=html.match(/const DATA=(\[[^\n]+?\]);/);
 if(!m)throw Error('Adult word data missing');
 return new Map(JSON.parse(m[1]).map(x=>[key(x[0]),x[1]]));
}
function missing(history,stories,date){
 const saved=new Set(stories.filter(x=>x.sourceDate&&Number.isInteger(x.sourceSlot)).map(x=>x.sourceDate+':'+x.sourceSlot));
 return history.history.filter(x=>x.type!=='manual'&&x.date<=date&&Array.isArray(x.adult)&&x.adult.length===10)
  .sort((a,b)=>a.date.localeCompare(b.date))
  .flatMap(x=>[0,1].filter(slot=>!saved.has(x.date+':'+slot)).map(slot=>({date:x.date,slot,words:x.adult.slice(slot*5,slot*5+5)})));
}
function validate(obj,task,titles){
 if(!obj||!themes.includes(obj.topic)||typeof obj.title!=='string'||obj.title.length<10||obj.title.length>95||titles.has(key(obj.title)))throw Error('Invalid theme/title or duplicate title');
 if(!Array.isArray(obj.paragraphs)||obj.paragraphs.length!==2||obj.paragraphs.some(x=>typeof x!=='string'||x.length<130||x.length>1100))throw Error('Expected two complete English paragraphs');
 if(typeof obj.translation!=='string'||obj.translation.length<90||obj.translation.length>2200||obj.translation.split(/\n\s*\n/).length!==2||!/[가-힣]/.test(obj.translation))throw Error('Korean paragraphs missing');
 const body=obj.paragraphs.join(' ');
 const marks=[...body.matchAll(/\{\{([^{}]+)\}\}/g)].map(x=>x[1]);
 if(marks.length!==5||task.words.some(w=>marks.filter(x=>x===w).length!==1))throw Error('Five exact vocabulary markers required');
 if(/\{\{|\}\}/.test(body.replace(/\{\{[^{}]+\}\}/g,'')))throw Error('Broken markers');
 const n=body.replace(/\{\{|\}\}/g,'').trim().split(/\s+/).length;
 if(n<85||n>190)throw Error('Wrong English word count '+n);
 return {title:obj.title.trim(),topic:obj.topic,words:task.words,paragraphs:obj.paragraphs,translation:obj.translation.trim(),sourceDate:task.date,sourceSlot:task.slot};
}
async function generate(task,definitions,titles){
 const words=task.words.map(word=>({word,meaning:definitions.get(key(word))}));
 if(words.some(x=>!x.meaning))throw Error('Missing Korean meaning for scheduled word');
 const instructions=[
 'Create an original realistic adult workplace English learning story with a beginning, problem and resolution, about 100-150 English words.',
 'Include EXACTLY these 5 words or multiword expressions ONCE EACH, with exact case and spelling, wrapped in {{double braces}}. Do not include other curly-brace markers.',
 JSON.stringify(words),
 'Choose one theme EXACTLY from '+JSON.stringify(themes)+'. Prefer professional customer support, global collaboration and meetings.',
 'Write TWO substantial English paragraphs in a paragraphs array and a faithful, complete Korean translation in TWO paragraphs separated by a blank line. Do not put {{markers}} in Korean.',
 'Respond in JSON with title (unique English title), topic, paragraphs, translation. Avoid these titles: '+JSON.stringify([...titles].slice(-50))
 ].join('\n');
 const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),90000);
 try{
  const res=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:ctl.signal,headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.WORDLAB_STORY_MODEL||'gpt-4.1-mini',temperature:0.6,response_format:{type:'json_object'},messages:[{role:'system',content:'Write precise natural bilingual ESL stories. Follow all exact vocabulary marker and translation constraints.'},{role:'user',content:instructions}]})});
  const data=await res.json();
  if(!res.ok)throw Error('API HTTP '+res.status+': '+String(data.error?.message||'').slice(0,160));
  return validate(JSON.parse(data.choices?.[0]?.message?.content||'{}'),task,titles);
 }finally{clearTimeout(timer)}
}
async function main(){
 const raw=fs.readFileSync(STORIES,'utf8'),{original,stories}=loadStories(raw);
 const history=JSON.parse(fs.readFileSync(path.join(root,'data/word-update-history.json'),'utf8'));
 const definitions=getWords(fs.readFileSync(path.join(root,'index.html'),'utf8'));
 const pending=missing(history,stories,process.env.WORDLAB_TEST_DATE||today());
 console.log('Missing story slots: '+pending.length+'; slots in this run: '+Math.min(limit,pending.length));
 if(!pending.length)return;
 if(!process.env.OPENAI_API_KEY)throw Error('OPENAI_API_KEY is not configured in repository Actions secrets');
 const titles=new Set(stories.map(s=>key(s.title)));
 let made=0,failed=0;
 for(const task of pending.slice(0,limit)){
  let story;
  for(let attempt=1;attempt<=2;attempt++)try{story=await generate(task,definitions,titles);break}catch(e){console.error(task.date+' #'+(task.slot+1)+' attempt '+attempt+': '+e.message)}
  if(!story){failed++;continue}
  stories.push(story);titles.add(key(story.title));made++;
  console.log('Generated '+task.date+' #'+(task.slot+1)+': '+story.title);
 }
 if(made){
  const serialized=JSON.stringify(stories).replace(/</g,'\\u003c').replace(/>/g,'\\u003e');
  fs.writeFileSync(STORIES,raw.replace(original,'window.WORDLAB_STORIES='+serialized+';'));
 }
 console.log('Published-ready '+made+'; failed '+failed+'; missing '+(pending.length-made));
 if(failed)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={loadStories,missing,validate};
