'use strict';
/* WordLab daily updater. Fully offline: vetted word bank + transparent combinatorial phrase fallback. */
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const ADULT_FILE=path.join(ROOT,'index.html'),KIDS_FILE=path.join(ROOT,'kids/index.html');
const BANK_FILE=path.join(ROOT,'data/word-bank.json'),HISTORY_FILE=path.join(ROOT,'data/word-update-history.json');
const DAILY=10,START='2026-10-25';
const key=s=>String(s).normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
const dateKST=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const nextDay=s=>new Date(Date.parse(s+'T00:00:00Z')+86400000).toISOString().slice(0,10);
function parseData(html,label){
 const rx=label==='adult'?/const DATA=(\[[^\n]+?\]);/:/const DATA=(\{[^\n]+?\});/;
 const match=html.match(rx);
 if(!match)throw Error(label+': DATA assignment missing');
 return {match,data:JSON.parse(match[1])};
}
// Each generated phrase has a complete, human-authored Korean modifier and noun.
// Phrases are supplementary. A curated single-word bank always takes priority.
const THEMES={
 adult:{
  adjectives:[['Proactive','선제적인'],['Systematic','체계적인'],['Comprehensive','종합적인'],['Timely','시기적절한'],['Strategic','전략적인'],['Collaborative','협력적인'],['Transparent','투명한'],['Structured','구조화된'],['Practical','실용적인'],['Effective','효과적인'],['Consistent','일관된'],['Thorough','철저한'],['Cross-functional','부서 간 협업을 통한'],['Evidence-based','근거 중심의'],['Customer-focused','고객 중심의'],['Long-term','장기적인'],['Operational','운영상의'],['Preventive','예방적인'],['Targeted','목표에 맞춘'],['Continuous','지속적인']],
  nouns:[['risk assessment','위험 평가'],['quality review','품질 검토'],['process improvement','프로세스 개선'],['resource planning','자원 계획'],['customer feedback','고객 피드백'],['issue resolution','문제 해결'],['team coordination','팀 간 조율'],['performance analysis','성과 분석'],['root cause analysis','근본 원인 분석'],['service recovery','서비스 회복'],['workflow optimization','업무 흐름 최적화'],['stakeholder communication','이해관계자 소통'],['compliance monitoring','규정 준수 점검'],['capacity planning','처리 용량 계획'],['contingency planning','비상 대응 계획'],['case management','사례 관리'],['data validation','데이터 검증'],['escalation management','상위 보고 관리'],['training program','교육 프로그램'],['customer support','고객 지원'],['policy implementation','정책 시행'],['service evaluation','서비스 평가']]
 },
 '1-2':{
  adjectives:[['Little','작은'],['Big','큰'],['New','새'],['Old','오래된'],['Clean','깨끗한'],['Colorful','알록달록한'],['Tiny','아주 작은'],['Pretty','예쁜'],['Shiny','반짝이는'],['Soft','부드러운'],['Round','둥근'],['Bright','밝은'],['Lovely','사랑스러운'],['Small','작은'],['Happy','행복한'],['Funny','재미있는'],['Beautiful','아름다운'],['Yellow','노란'],['Blue','파란'],['Green','초록색의']],
  nouns:[['ball','공'],['bag','가방'],['box','상자'],['cup','컵'],['hat','모자'],['shirt','셔츠'],['sock','양말'],['book','책'],['pencil','연필'],['balloon','풍선'],['toy car','장난감 자동차'],['kite','연'],['bicycle','자전거'],['door','문'],['window','창문'],['flower','꽃'],['chair','의자'],['desk','책상'],['umbrella','우산'],['boat','배'],['apple','사과'],['cookie','쿠키'],['ribbon','리본'],['teddy bear','곰 인형'],['butterfly','나비'],['bird','새']]
 },
 '3-4':{
  adjectives:[['Tropical','열대의'],['Ancient','고대의'],['Natural','자연의'],['Coastal','해안의'],['Mountain','산악의'],['Seasonal','계절적인'],['Local','지역의'],['Global','세계적인'],['Wild','야생의'],['Underground','지하의'],['Freshwater','민물의'],['Volcanic','화산의'],['Solar','태양의'],['Ocean','해양의'],['Desert','사막의'],['Polar','극지방의'],['Rainforest','열대우림의'],['River','강의'],['Weather','날씨의'],['Earth','지구의']],
  nouns:[['ecosystem','생태계'],['habitat','서식지'],['landscape','풍경'],['climate','기후'],['temperature','온도'],['water cycle','물의 순환'],['animal migration','동물의 이동'],['plant life','식물의 생명 활동'],['soil layer','토양층'],['rock formation','암석 형성'],['fossil record','화석 기록'],['food chain','먹이 사슬'],['energy source','에너지원'],['weather pattern','날씨 패턴'],['exploration','탐험'],['discovery','발견'],['region','지역'],['environment','환경'],['research','연구'],['species','생물종'],['water supply','물 공급']]
 },
 '5-6':{
  adjectives:[['Economic','경제적인'],['Environmental','환경적인'],['Scientific','과학적인'],['Historical','역사적인'],['Cultural','문화적인'],['International','국제적인'],['Political','정치적인'],['Social','사회적인'],['Technological','기술적인'],['Educational','교육적인'],['Sustainable','지속 가능한'],['Renewable','재생 가능한'],['Democratic','민주적인'],['Industrial','산업적인'],['Digital','디지털의'],['Financial','재정적인'],['Ecological','생태학적인'],['Global','세계적인'],['Regional','지역적인'],['Human','인간의']],
  nouns:[['development','발전'],['growth','성장'],['change','변화'],['system','체계'],['policy','정책'],['resources','자원'],['research','연구'],['innovation','혁신'],['cooperation','협력'],['challenges','과제'],['perspective','관점'],['principles','원칙'],['framework','체계'],['responsibility','책임'],['impact','영향'],['influence','영향력'],['structure','구조'],['institutions','기관'],['opportunities','기회'],['process','과정'],['progress','진전']]
 }
};
function phraseBank(grade){
 const t=THEMES[grade],out=[];
 for(const [adj,koAdj] of t.adjectives)for(const [noun,koNoun] of t.nouns){
  const name=adj+' '+noun,ko=koAdj+' '+koNoun;
  if(grade==='adult'){
   out.push([name,ko,'표현 구성: '+adj+'('+koAdj+') + '+noun+'('+koNoun+')',
    'We should discuss '+name.toLowerCase()+' during the meeting.',
    '회의 중 '+ko+'에 대해 논의해야 합니다.']);
  }else if(grade==='1-2'){
   const article=/^[aeiou]/i.test(adj)?'an':'a';
   out.push([name,ko,'📖','I see '+article+' '+name.toLowerCase()+'.']);
  }else if(grade==='3-4'){
   out.push([name,ko,'🌿','We learned about '+name.toLowerCase()+' in class.']);
  }else{
   out.push([name,ko,'📚','We discussed '+name.toLowerCase()+' in class.']);
  }
 }
 return out;
}
function candidates(curated,grade,seen){
 const n=grade==='adult'?5:4;
 const isValid=w=>Array.isArray(w)&&w.length===n&&w.every(x=>typeof x==='string'&&x.trim())&&!seen.has(key(w[0]));
 const pool=[];
 for(const w of (grade==='adult'?curated:[...curated,...phraseBank(grade)]))if(isValid(w)){pool.push(w);seen.add(key(w[0]))}
 return pool;
}
function build(){
 const htmlA=fs.readFileSync(ADULT_FILE,'utf8'),htmlK=fs.readFileSync(KIDS_FILE,'utf8');
 const a=parseData(htmlA,'adult'),k=parseData(htmlK,'kids');
 const bank=JSON.parse(fs.readFileSync(BANK_FILE,'utf8')),history=JSON.parse(fs.readFileSync(HISTORY_FILE,'utf8'));
 if(!Array.isArray(a.data)||!Array.isArray(bank.adult)||!Array.isArray(history.history))throw Error('Invalid data source');
 const grades=['1-2','3-4','5-6'];
 for(const g of grades)if(!Array.isArray(k.data[g])||!Array.isArray(bank.kids[g]))throw Error('Missing Kids grade: '+g);
 const seenA=new Set(a.data.map(w=>key(w[0])));
 const seenK=new Set(grades.flatMap(g=>k.data[g]).map(w=>key(w[0])));
 const adultPool=candidates(bank.adult,'adult',new Set(seenA));
 const kidPools={};const reserve=new Set(seenK);
 for(const g of grades)kidPools[g]=candidates(bank.kids[g],g,reserve);
 const completed=new Set(history.completedDates||[]);
 const today=process.env.WORDLAB_TEST_DATE||dateKST();
 let days=0,newAdults=0,newKids=0;
 for(let date=START;date<=today;date=nextDay(date)){
  let record=history.history.find(r=>r.date===date&&r.type!=='manual');
  // Respect explicitly completed legacy dates that have no detailed record.
  if(!record&&completed.has(date))continue;
  const adultExisting=record?.adult?.length||0;
  const gradeExisting=Object.fromEntries(grades.map(g=>[g,record?.kids?.[g]?.length||0]));
  if(adultExisting>=DAILY&&grades.every(g=>gradeExisting[g]>=DAILY)){completed.add(date);continue}
  const neededA=Math.max(0,DAILY-adultExisting);
  const neededK=Object.fromEntries(grades.map(g=>[g,Math.max(0,DAILY-gradeExisting[g])])); 
  if(adultPool.length<neededA||grades.some(g=>kidPools[g].length<neededK[g])){
   throw Error('INSUFFICIENT_CANDIDATES '+date+' '+JSON.stringify({adult:adultPool.length,kids:Object.fromEntries(grades.map(g=>[g,kidPools[g].length]))})+'. No partial completion recorded.');
  }
  const adults=adultPool.splice(0,neededA);
  const kids=Object.fromEntries(grades.map(g=>[g,kidPools[g].splice(0,neededK[g])]));
  // Newest adult vocabulary is shown first in the all-cards deck.
  for(const w of adults)seenA.add(key(w[0]));
  a.data.unshift(...adults);
  for(const g of grades)for(const w of kids[g]){k.data[g].push(w);seenK.add(key(w[0]))}
  if(!record){record={date,adult:[],kids:Object.fromEntries(grades.map(g=>[g,[]]))};history.history.push(record)}
  record.adult.push(...adults.map(w=>w[0]));
  for(const g of grades)record.kids[g].push(...kids[g].map(w=>w[0]));
  if(date!==today)record.backfilledAtKST=today;
  completed.add(date);days++;newAdults+=adults.length;newKids+=grades.reduce((n,g)=>n+kids[g].length,0);
  console.log('COMPLETE '+date+': adult '+record.adult.length+', Kids '+grades.map(g=>g+':'+record.kids[g].length).join(', '));
 }
 if(!days){console.log('Daily vocabulary already complete through '+today);return}
 const revisedA=htmlA.replace(a.match[0],'const DATA='+JSON.stringify(a.data)+';');
 const revisedK=htmlK.replace(k.match[0],'const DATA='+JSON.stringify(k.data)+';');
 if(parseData(revisedA,'adult').data.length!==a.data.length||JSON.stringify(parseData(revisedK,'kids').data)!==JSON.stringify(k.data))throw Error('DATA verification failed');
 history.completedDates=[...completed].sort();
 history.lastUpdatedKST=today;
 history.history.sort((a,b)=>a.date.localeCompare(b.date));
 fs.writeFileSync(ADULT_FILE,revisedA);
 fs.writeFileSync(KIDS_FILE,revisedK);
 fs.writeFileSync(HISTORY_FILE,JSON.stringify(history,null,2)+'\n');
 console.log('SUCCESS: '+days+' date(s) updated; adult +'+newAdults+', Kids +'+newKids);
}
if(require.main===module)build();
module.exports={build,parseData,key,nextDay,phraseBank,candidates};
