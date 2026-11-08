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
  const nextIndex = (days.findIndex(d => d.id === state.history.at(-1)?.day.id) + 1) % days.length;
  const ordered = [...days.slice(nextIndex), ...days.slice(0, nextIndex)];
  return '<h1>Мой план</h1>' + ordered.map((day, position) => {
    const total = day.exercises.reduce((sum, e) => sum + e.count, 0);
    const items = day.exercises.map(e => '<li><b>' + escape(e.name) + '</b><small>' + escape(e.sets) + '</small></li>').join('');
    const title = position === 0 ? 'Следующая тренировка' : 'Также в программе';
    return `<article class="day ${position === 0 ? 'featured' : ''}">
      <div class="day-head"><small>${title}</small><h2>${escape(day.name)}</h2><p>${total} подх. · ${day.exercises.length} упр.</p></div>
      <details open><summary>Состав тренировки</summary><ol>${items}</ol></details>
      ${button('Начать ' + day.name, 'start-' + days.indexOf(day), position === 0 ? 'primary arrow' : 'secondary arrow')}
    </article>`;
  }).join('');
}
function counter(id, label, value, min, step) {
  const numberStep = id === 'weight' ? 'any' : '1';
  return `<div class="counter"><label for="${id}">${escape(label)}</label>
    <div class="stepper"><button type="button" data-adjust="-${step}" data-field="${id}" aria-label="Уменьшить · ${escape(label)}">−</button>
    <input id="${id}" type="number" min="${min}" step="${numberStep}" inputmode="${id === 'weight' ? 'decimal' : 'numeric'}" ${id === 'reps' ? 'required' : ''} value="${escape(value)}">
    <button type="button" data-adjust="${step}" data-field="${id}" aria-label="Увеличить · ${escape(label)}">+</button></div></div>`;
}
function logged(a, e) {
  return a.log.filter(set => set.id === e.id).length;
}
function skipped(a) {
  // Earlier sessions used a forward-only cursor. Preserve their skipped exercises.
  return a.skipped ?? a.day.exercises.slice(0,a.index)
    .filter(e => logged(a,e) < e.count).map(e => e.id);
}
function selectExercise(a, index) {
  a.index = index;
  const exercise = a.day.exercises[index];
  a.set = exercise ? logged(a, exercise) : 0;
  a.draft = a.drafts?.[exercise?.id] ?? null;
}
function advance(a) {
  const exercises = a.day.exercises;
  for (let offset=1; offset<=exercises.length; offset++) {
    const index = (a.index + offset) % exercises.length;
    const e = exercises[index];
    if (logged(a,e)<e.count && !a.skipped.includes(e.id)) {
      selectExercise(a,index);
      return;
    }
  }
  selectExercise(a,exercises.length);
}
function exerciseList(a) {
  const skippedIds = skipped(a);
  const rows = a.day.exercises.map((e,i) => {
    const count = logged(a,e), done = count >= e.count;
    const current = i === a.index;
    const status = done ? '✓' : skippedIds.includes(e.id) ? '↷' : String(i+1).padStart(2,'0');
    return `<button class="exercise-row" data-action="pick-${i}" aria-pressed="${current}" ${done ? 'disabled' : ''}>
      <span class="serial">${status}</span><span>${escape(e.name)}</span><span class="set-count">${count}/${e.count}</span></button>`;
  });
  return '<div class="roster" aria-label="Упражнения тренировки">'+rows.join('')+'</div>';
}
function active() {
  const a = state.active, e = a.day.exercises[a.index];
  const total = a.day.exercises.reduce((sum, ex) => sum + ex.count, 0);
  const progress = `<div class="session-meta"><b>${escape(a.day.name)}</b><small>${a.log.length} / ${total} подх.</small></div>
    <progress aria-label="Записанные подходы" value="${a.log.length}" max="${total}"></progress>`;
  if (!e) return progress + exerciseList(a) + '<h1>Готово</h1>' + button('Сохранить тренировку', 'finish', 'primary');
  const old = previous(e, a.set);
  const last = a.log.filter(s => s.id === e.id).at(-1);
  const reps = a.draft?.reps ?? last?.reps ?? old?.reps ?? Number(e.sets.match(/×\s*(\d+)/)?.[1] || 1);
  const weight = a.draft?.weight ?? last?.weight ?? old?.weight ?? '';
  const rest = a.until > Date.now() ? `<article class="rest"><div><small>Отдых</small><strong id="remaining"></strong></div>${button('Пропустить', 'rest')}</article>` : '';
  return `${progress}${exerciseList(a)}<section class="exercise"><small>Упражнение ${a.index+1} из ${a.day.exercises.length}</small>
    <h1>${escape(e.name)}</h1><strong>${escape(e.sets)}</strong><p>${escape(e.note)}</p></section>
    ${rest}<form id="entry"><div class="session-meta"><h2>Подход ${a.set+1} из ${e.count}</h2></div>
    ${old ? '<p class="previous">В прошлый раз · <b>'+escape(format(old,e))+'</b></p>' : ''}
    ${e.weightLabel ? counter('weight', e.weightLabel+' · кг', weight, 0, 2.5) : ''}
    ${counter('reps', unit(e), reps, 1, 1)}
    <button class="primary">✓ &nbsp; Записать подход</button></form>
    <div class="actions">${button('Пропустить упражнение','skip')}${button('Завершить раньше','early')}</div>`;
}
function history() {
  const sessions = [...state.history].reverse();
  const rows = sessions.map(a => {
    const date = new Date(a.finished).toLocaleDateString('ru-RU',{day:'numeric',month:'short', year:'numeric'});
    const exercises = a.day.exercises.map(e => {
      const sets = a.log.filter(s => s.id === e.id);
      return sets.length ? '<li><b>'+escape(e.name)+'</b><small>'+sets.map(s=>escape(format(s,e))).join(' / ')+'</small></li>' : '';
    }).join('');
    return `<details class="record"><summary><small>${date}</small><strong>${escape(a.day.name)}</strong><span>${a.log.length} подх.</span></summary><ul>${exercises}</ul></details>`;
  }).join('');
  const empty = '<article class="empty"><h2>Пока нет тренировок</h2><p>Заверши занятие, и здесь появятся упражнения, веса и повторы.</p>'+button(state.active?'Вернуться к тренировке':'Выбрать тренировку','train')+'</article>';
  return '<h1>Журнал</h1>'+(rows || empty)+'<details class="backup"><summary>Резервная копия</summary><div class="actions">'+button('Скачать копию','export')+button('Восстановить','restore')+'</div></details><input id="backup" type="file" accept=".json" hidden>';
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
  next.active.drafts ??= {};
  next.active.drafts[next.active.day.exercises[next.active.index].id] = next.active.draft;
  save(next);
});
view.addEventListener('submit',event=>{
  event.preventDefault();
  const reps=byId('reps').valueAsNumber, weight=byId('weight')?.valueAsNumber;
  commit(next=>{
    const a=next.active, e=a.day.exercises[a.index];
    a.skipped ??= skipped(a);
    a.log.push({id:e.id,reps,weight:Number.isFinite(weight)?weight:null});
    a.draft=null;
    if(a.drafts) delete a.drafts[e.id];
    if(++a.set===e.count) advance(a);
    a.until=Date.now()+1000*e.restSeconds;
  });
});
view.addEventListener('click',event=>{
  const adjust = event.target.closest('[data-adjust]');
  if (adjust) {
    const field = byId(adjust.dataset.field);
    field.value = Math.max(Number(field.min), Math.round(((Number(field.value) || 0) + Number(adjust.dataset.adjust)) * 100) / 100);
    field.dispatchEvent(new Event('input', {bubbles:true}));
    return;
  }
  const action=event.target.closest('[data-action]')?.dataset.action;
  if(!action)return;
  if(action==='train'){page='train';render();return;}
  if(action.startsWith('start-'))return commit(s=>{
    s.active={day:structuredClone(s.plan.days[Number(action.slice(6))]),version:s.plan.version,index:0,set:0,log:[],until:0,draft:null};
  });
  if(action.startsWith('pick-')) return commit(s=>{
    const a=s.active, index=Number(action.slice(5));
    a.skipped=skipped(a).filter(id=>id!==a.day.exercises[index].id);
    if(a.draft && a.day.exercises[a.index]) {
      a.drafts ??= {};
      a.drafts[a.day.exercises[a.index].id]=a.draft;
    }
    selectExercise(a,index);
  });
  if(action==='rest')return commit(s=>{s.active.until=0;});
  if(action==='skip' && confirm('Пропустить оставшиеся подходы этого упражнения?'))return commit(s=>{const a=s.active; a.skipped=[...skipped(a),a.day.exercises[a.index].id]; advance(a); a.until=0;});
  if(action==='finish' || (action==='early' && confirm('Завершить тренировку и сохранить записанные подходы?')))return commit(finish);
  if(action==='export'){
    const link=document.createElement('a');
    link.download='podhod-journal.json';
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
  }catch{byId('notice').textContent='Не удалось прочитать резервную копию приложения «Подход».';}
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




