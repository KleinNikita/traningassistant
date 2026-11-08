'use strict';
const byId = id => document.getElementById(id);
const key = 'vshape.training.1';
const view = byId('view');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state, page = 'train';
function save(next) {
  try { localStorage.setItem(key, JSON.stringify(next)); state = next; return true; }
  catch { byId('notice').textContent = 'Не удалось сохранить запись. Проверь свободное место в браузере.'; return false; }
}
function commit(edit) {
  const next = structuredClone(state);
  edit(next);
  if (save(next)) render();
}
function button(text, action, cls = '') {
  return '<button class="'+cls+'" data-action="'+action+'">'+escape(text)+'</button>';
}
function unit(e) { return e.sets.includes('секунд') ? 'Секунды' : 'Повторы'; }
function format(s,e) {
  return (s.weight !== null ? s.weight+' кг × ' : '')+s.reps+(unit(e)==='Секунды'?' с':' повт.');
}
function previous(e,n) {
  for (const session of [...state.history].reverse()) {
    const entries = session.log.filter(s => s.id === e.id);
    if (entries.length) return entries[n] || entries.at(-1);
  }
}
function overview() {
  const days = state.plan.days;
  const last = state.history.at(-1);
  const next = days[(days.findIndex(d=>d.id===last?.day.id)+1)%days.length];
  return '<h1>Тренировки</h1>'+days.map((d,i)=>'<article><small>'+ (d===next?'Следующая тренировка':'По плану')+'</small><h2>'+escape(d.name)+'</h2><details><summary>'+d.exercises.length+' упражнений</summary><ol>'+d.exercises.map(e=>'<li>'+escape(e.name)+' · '+escape(e.sets)+'</li>').join('')+'</ol></details>'+button('Начать '+d.name,'start-'+i,'primary')+'</article>').join('');
}
function active() {
  const a=state.active, e=a.day.exercises[a.index];
  const total=a.day.exercises.reduce((n,e)=>n+e.count,0);
  const progress='<small>'+escape(a.day.name)+' · '+a.log.length+' / '+total+' подходов</small><progress value="'+a.log.length+'" max="'+total+'"></progress>';
  if (!e) return progress+'<h1>Готово</h1>'+button('Сохранить тренировку','finish','primary');
  const old=previous(e,a.set), same=a.log.filter(s=>s.id===e.id).at(-1);
  const target=e.sets.match(/×\s*(\d+)/);
  const rest=a.until>Date.now()?'<article class="rest"><div class="row"><strong>Отдых <span id="remaining"></span></strong>'+button('Пропустить','rest')+'</div></article>':'';
  const reps=a.draft?.reps ?? same?.reps ?? old?.reps ?? Number(target?.[1] || 1);
  const weight=a.draft?.weight ?? same?.weight ?? old?.weight ?? '';
  return progress+rest+'<h1>'+escape(e.name)+'</h1><p>'+escape(e.sets)+' · подход '+(a.set+1)+' из '+e.count+'</p><p>'+escape(e.note)+'</p><article><small>Прошлый результат</small><h2>'+(old?escape(format(old,e)):'Первое занятие')+'</h2><form id="entry"><div class="inputs">'+(e.weightLabel?'<label>'+escape(e.weightLabel)+' (кг)<input id="weight" type="number" min="0" step="any" inputmode="decimal" value="'+escape(weight)+'"></label>':'')+'<label>'+unit(e)+'<input id="reps" required type="number" min="1" step="1" inputmode="numeric" value="'+escape(reps)+'"></label></div><button class="primary">Записать подход</button></form></article><div class="row">'+button('Пропустить упражнение','skip','quiet')+button('Завершить раньше','early','quiet')+'</div>';
}
function history() {
  return '<h1>Журнал</h1>'+(!state.history.length?'<p>Здесь появится первая сохранённая тренировка.</p>':'')+[...state.history].reverse().map(a=>'<details><summary>'+escape(a.day.name)+' · '+new Date(a.finished).toLocaleDateString('ru-RU')+' · '+a.log.length+' подх.</summary>'+a.day.exercises.map(e=>{
    const sets=a.log.filter(s=>s.id===e.id);
    return sets.length?'<p><b>'+escape(e.name)+'</b><br>'+sets.map(s=>escape(format(s,e))).join(' / ')+'</p>':'';
  }).join('')+'</details>').join('')+button('Скачать резервную копию','export')+button('Восстановить из копии','restore')+'<input id="backup" type="file" accept=".json" hidden>';
}
function render(){
  for(const tab of ['train','journal']) byId(tab).setAttribute('aria-pressed',page===tab);
  view.innerHTML=page==='journal'?history():state.active?active():overview();
  tick();
}
function tick(){
  const el=byId('remaining');
  if(!el)return;
  const sec=Math.max(0,Math.ceil((state.active.until-Date.now())/1000));
  el.textContent=Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
  if(!sec)el.closest('article').hidden=true;
}
function finish(next){
  if(next.active.log.length) next.history.push({...next.active,finished:Date.now()});
  next.active=null;
}
view.addEventListener('input',event=>{
  if(!event.target.closest('#entry'))return;
  const next=structuredClone(state);
  next.active.draft={reps:byId('reps').value,weight:byId('weight')?.value??''};
  save(next);
});
view.addEventListener('submit',event=>{
  event.preventDefault();
  const reps=byId('reps').valueAsNumber, weight=byId('weight')?.valueAsNumber;
  commit(next=>{
    const a=next.active, e=a.day.exercises[a.index];
    a.log.push({id:e.id,reps,weight:Number.isFinite(weight)?weight:null});
    a.draft=null;
    if(++a.set===e.count){a.index++;a.set=0;}
    a.until=Date.now()+1000*e.restSeconds;
  });
});
view.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(!action)return;
  if(action.startsWith('start-'))return commit(s=>{
    s.active={day:structuredClone(s.plan.days[Number(action.slice(6))]),version:s.plan.version,index:0,set:0,log:[],until:0,draft:null};
  });
  if(action==='rest')return commit(s=>{s.active.until=0;});
  if(action==='skip' && confirm('Пропустить оставшиеся подходы этого упражнения?'))return commit(s=>{s.active.index++;s.active.set=0;s.active.draft=null;s.active.until=0;});
  if(action==='finish' || (action==='early' && confirm('Завершить тренировку и сохранить записанные подходы?')))return commit(finish);
  if(action==='export'){
    const link=document.createElement('a');
    link.download='vshape-journal.json';
    link.href=URL.createObjectURL(new Blob([JSON.stringify({schema:1,data:state})],{type:'application/json'}));
    link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
  if(action==='restore')byId('backup').click();
});
function validPlan(p){
  return Number.isInteger(p?.version) && Array.isArray(p.days) && p.days.length && p.days.every(d=>typeof d.name==='string' && Array.isArray(d.exercises) && d.exercises.length && d.exercises.every(e=>typeof e.id==='string' && typeof e.name==='string' && typeof e.sets==='string' && Number.isInteger(e.count) && e.count>0 && Number.isFinite(e.restSeconds)));
}
function validSession(s){
  return s && validPlan({version:1,days:[s.day]}) && Array.isArray(s.log) && s.log.every(x=>x && typeof x.id==='string' && Number.isInteger(x.reps) && x.reps>0 && (x.weight===null || Number.isFinite(x.weight))) && Number.isInteger(s.index) && s.index>=0 && s.index<=s.day.exercises.length && Number.isInteger(s.set) && s.set>=0 && (!s.day.exercises[s.index] || s.set<s.day.exercises[s.index].count);
}
view.addEventListener('change',async event=>{
  if(event.target.id!=='backup' || !event.target.files.length)return;
  try{
    const {schema,data}=JSON.parse(await event.target.files[0].text());
    if(schema!==1 || !validPlan(data?.plan) || !Array.isArray(data.history) || !data.history.every(s=>validSession(s)&&Number.isFinite(s.finished)) || (data.active!==null && !validSession(data.active)))throw Error();
    if(confirm('Заменить текущий журнал и активную тренировку данными из копии?') && save({...data,plan:state.plan}))render();
  }catch{byId('notice').textContent='Не удалось прочитать резервную копию V-Shape.';}
});
async function init(){
  const raw=localStorage.getItem(key);
  state=raw?JSON.parse(raw):{plan:null,active:null,history:[]};
  if(state.plan)render();
  try{
    const response=await fetch('./plan.json',{cache:'no-store'});
    if(!response.ok)throw Error();
    const p=await response.json();
    if(!validPlan(p))throw Error();
    if(!state.plan || p.version>state.plan.version){
      const updated=Boolean(state.plan);
      if(!save({...state,plan:p}))return;
      if(updated)byId('notice').textContent='План обновлён для следующих тренировок.';
    }
  }catch{if(!state.plan)throw Error();}
  render();
  for(const tab of ['train','journal'])byId(tab).onclick=()=>{page=tab;render();};
  setInterval(tick,500);
  if('serviceWorker' in navigator){
    try{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;byId('offline').textContent='Готово к офлайн';}
    catch{byId('offline').textContent='Только онлайн';}
  }
}
init().catch(()=>{view.textContent='Не удалось открыть план. Проверь соединение и доступ к хранилищу браузера, затем обнови страницу.';});
