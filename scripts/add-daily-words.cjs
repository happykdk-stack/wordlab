'use strict';
/* Daily WordLab vocabulary update. Built-in curated inventory, no paid API dependency. */
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const ADULT_FILE=path.join(ROOT,'index.html');
const KIDS_FILE=path.join(ROOT,'kids/index.html');
const BANK_FILE=path.join(ROOT,'data/word-bank.json');
const HISTORY_FILE=path.join(ROOT,'data/word-update-history.json');
const DAILY_ADULT=10,DAILY_KIDS=10;
const START='2026-10-25';
const key=s=>String(s).normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const dateKST=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const utcDay=s=>new Date(s+'T00:00:00Z');
const nextDay=s=>new Date(utcDay(s).getTime()+86400000).toISOString().slice(0,10);
function parseData(html,label){
 const regex=label==='adult'?/const DATA=(\[[^\n]+?\]);/:/const DATA=(\{[^\n]+?\});/;
 const match=html.match(regex);
 if(!match)throw Error(label+': DATA assignment not found');
 return {match,regex,data:JSON.parse(match[1])};
}
function build(){
 const htmlA=fs.readFileSync(ADULT_FILE,'utf8'),htmlK=fs.readFileSync(KIDS_FILE,'utf8');
 const a=parseData(htmlA,'adult'),k=parseData(htmlK,'kids');
 const bank=JSON.parse(fs.readFileSync(BANK_FILE,'utf8'));
 const history=JSON.parse(fs.readFileSync(HISTORY_FILE,'utf8'));
 if(!Array.isArray(a.data)||!bank.adult||!bank.kids||!Array.isArray(history.history))throw Error('Invalid word inventory or history');
 for(const grade of ['1-2','3-4','5-6'])if(!Array.isArray(k.data[grade])||!Array.isArray(bank.kids[grade]))throw Error('Missing grade '+grade);
 const adultSeen=new Set(a.data.map(w=>key(w[0])));
 const kidsSeen=new Set(Object.values(k.data).flat().map(w=>key(w[0])));
 const completed=new Set(history.completedDates||[]);
 const today=process.env.WORDLAB_TEST_DATE||dateKST();
 let day=START,addedDays=0;
 while(day<=today){
  if(!completed.has(day)){
   const adults=bank.adult.filter(w=>Array.isArray(w)&&w.length===5&&w.every(Boolean)&&!adultSeen.has(key(w[0]))).slice(0,DAILY_ADULT);
   const children={};
   const provisional=new Set(kidsSeen);
   for(const grade of ['1-2','3-4','5-6']){
    children[grade]=bank.kids[grade].filter(w=>Array.isArray(w)&&w.length===4&&w.every(Boolean)&&!provisional.has(key(w[0]))).slice(0,DAILY_KIDS);
    children[grade].forEach(w=>provisional.add(key(w[0])));
   }
   if(adults.length!==DAILY_ADULT||Object.values(children).some(words=>words.length!==DAILY_KIDS)){
    const remaining={adult:adults.length,...Object.fromEntries(Object.entries(children).map(([g,v])=>[g,v.length]))};
    throw Error('Not enough NEW curated words for '+day+': '+JSON.stringify(remaining)+'. Refusing incomplete update.');
   }
   adults.forEach(w=>{a.data.push(w);adultSeen.add(key(w[0]))});
   for(const grade of ['1-2','3-4','5-6'])children[grade].forEach(w=>{k.data[grade].push(w);kidsSeen.add(key(w[0]))});
   history.history.push({date:day,adult:adults.map(w=>w[0]),kids:Object.fromEntries(Object.entries(children).map(([g,v])=>[g,v.map(w=>w[0])]))});
   completed.add(day);addedDays++;
   console.log(day+': +10 Adult, +10 Kids per grade (+30).');
  }
  day=nextDay(day);
 }
 if(!addedDays){console.log('Up to date through '+today+'; no duplicates added.');return}
 const afterA=htmlA.replace(a.match[0],'const DATA='+JSON.stringify(a.data)+';');
 const afterK=htmlK.replace(k.match[0],'const DATA='+JSON.stringify(k.data)+';');
 if(parseData(afterA,'adult').data.length!==a.data.length)throw Error('Adult DATA verification failed');
 if(Object.values(parseData(afterK,'kids').data).reduce((n,x)=>n+x.length,0)!==Object.values(k.data).reduce((n,x)=>n+x.length,0))throw Error('Kids DATA verification failed');
 history.completedDates=[...completed].sort();
 history.lastUpdatedKST=today;
 fs.writeFileSync(ADULT_FILE,afterA);
 fs.writeFileSync(KIDS_FILE,afterK);
 fs.writeFileSync(HISTORY_FILE,JSON.stringify(history,null,2)+'\n');
 console.log('SUCCESS: '+addedDays+' day(s), adult '+a.data.length+', kids '+Object.values(k.data).map(x=>x.length).join('/')+'.');
}
if(require.main===module)build();
module.exports={build,parseData,key,nextDay};
