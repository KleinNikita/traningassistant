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
  return '<button type="button" class="'+cls+'" data-action="'+action+'">'+escape(text)+'</button>';
}
function unit(e) { return /сек|\d\s*с(?:\s|$)/i.test(e.sets) ? 'Секунды' : 'Повторы'; }
function format(s,e) {
  return (s.weight !== null ? s.weight+' кг × ' : '')+s.reps+(unit(e)==='Секунды'?' с':' повт.');
}
function previous(e,n) {
  for (const session of [...state.history].reverse()) {
    const entries = session.log.filter(s => s.id === e.id);
    if (entries.length) return entries[n] || entries.at(-1);
  }
}
let previewDay = null;
function overview() {
  const selected = selectedPlan(state);
  const days = selected.plan.days;
  const nextIndex = (days.findIndex(d => d.id === state.history.at(-1)?.day.id) + 1) % days.length;
  const chosen = days.find(d=>d.id===previewDay) || days[nextIndex];
  const picker = '<div class="day-picker">'+days.map((d,i)=>'<button data-action="day-'+i+'" aria-pressed="'+(d===chosen)+'">'+escape(d.name)+'</button>').join('')+'</div>';
  return '<h1>'+escape(selected.name)+'</h1>' + picker + [chosen].map((day, position) => {
    const total = day.exercises.reduce((sum, e) => sum + e.count, 0);
    const items = day.exercises.map(e => '<li><b>' + escape(e.name) + '</b><small>' + escape(e.sets) + '</small></li>').join('');
    const title = day===days[nextIndex] ? 'Следующая тренировка' : 'Выбранный день';
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
    return `<div class="roster-line"><button class="exercise-row" data-action="${done ? 'edit' : 'pick'}-${i}" aria-pressed="${current}">
      <span class="serial">${status}</span><span>${escape(e.name)}</span></button><button class="set-count" data-action="${count?'edit':'pick'}-${i}" aria-label="Подходы: ${escape(e.name)}">${count}/${e.count}</button></div>`;
  });
  return '<div class="roster" aria-label="Упражнения тренировки">'+rows.join('')+'</div>';
}
function recent(a) {
  const set = a.log.at(-1);
  if (!set || !a.undoable) return '';
  const ex = a.day.exercises.find(e=>e.id===set.id);
  return '<div class="receipt"><small>Записано: '+escape(ex.name)+' · '+escape(format(set,ex))+'</small>'+button('Отменить','undo')+'</div>';
}
function showDialog(title, html) {
  const dialog = document.createElement('dialog');
  dialog.innerHTML = '<header><h2>'+escape(title)+'</h2><button aria-label="Закрыть">×</button></header>'+html;
  document.body.append(dialog);
  dialog.querySelector('header button').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.showModal();
  return dialog;
}
function editSets(index, historyIndex = -1) {
  const session = historyIndex<0 ? state.active : state.history[historyIndex];
  const ex = session.day.exercises[index];
  const rows = session.log.map((set,i)=>{
    if(set.id!==ex.id)return '';
    return '<div class="edit-set" data-index="'+i+'"><label>'+unit(ex)+'<input name="reps" required type="number" min="1" step="1" value="'+set.reps+'"></label>'+
      (ex.weightLabel?'<label>Вес, кг<input name="kg" type="number" min="0" step="any" value="'+(set.weight??'')+'"></label>':'')+'</div>';
  }).join('');
  const dialog=showDialog(ex.name,'<form>'+rows+'<button class="primary">Сохранить исправления</button></form>');
  dialog.querySelector('form').onsubmit=event=>{
    event.preventDefault();
    commit(next=>{
      const target=historyIndex<0?next.active:next.history[historyIndex];
      for(const row of dialog.querySelectorAll('[data-index]')){
        const set=target.log[Number(row.dataset.index)];
        set.reps=row.querySelector('[name=reps]').valueAsNumber;
        const kg=row.querySelector('[name=kg]')?.valueAsNumber;
        set.weight=Number.isFinite(kg)?kg:null;
      }
    });
    dialog.close();
  };
}
function replaceToday() {
  const a=state.active, original=a.day.exercises[a.index];
  const dialog=showDialog('Заменить сегодня','<form><label>Новое упражнение<input name="name" required maxlength="80" placeholder="Например, тяга блока" list="choices"></label><datalist id="choices">'+
    selectedPlan(state).plan.days.flatMap(day=>day.exercises).map(e=>'<option value="'+escape(e.name)+'">').join('')+'</datalist><p>Оставшиеся подходы: '+(original.count-a.set)+'. Уже записанные сохранятся.</p><button class="primary">Заменить</button></form>');
  dialog.querySelector('form').onsubmit=event=>{
    event.preventDefault();
    const field=event.target.elements.name;
    const name=field.value.trim();
    if(!name || a.day.exercises.some(e=>e.name.toLowerCase()===name.toLowerCase())){
      field.setCustomValidity('Введи другое упражнение, которого ещё нет в этой тренировке.');
      field.reportValidity();field.oninput=()=>field.setCustomValidity('');return;
    }
    const known=selectedPlan(state).plan.days.flatMap(d=>d.exercises).find(e=>e.name.toLowerCase()===name.toLowerCase());
    const count=original.count-a.set;
    const ex={...original,name,id:known?.id??'custom:'+name.toLowerCase(),count,
      sets:original.sets.replace(/^\d+/,String(count)),note:'Замена сегодня · '+original.name,
      weightLabel:known?.weightLabel??'Рабочий вес'};
    commit(s=>{
      const session=s.active;
      session.skipped=skipped(session);
      let index=session.index;
      if(session.set){
        const completed=session.set;
        session.day.exercises[index]={...original,count:completed,sets:original.sets.replace(/^\d+/,String(completed))};
        index++;
        session.day.exercises.splice(index,0,ex);
      }else session.day.exercises[index]=ex;
      session.undoable=false;
      selectExercise(session,index);
    });
    dialog.close();
  };
}
function active() {
  const a=state.active, e=a.day.exercises[a.index];
  const total=a.day.exercises.reduce((n,ex)=>n+ex.count,0);
  const rest=a.until>Date.now()?'<article class="rest"><small>Отдых <b id="remaining"></b></small>'+button('Пропустить','rest')+'</article>':'';
  const progress='<div class="session-meta"><b>'+escape(a.day.name)+'</b><small>'+a.log.length+' / '+total+' подх.</small></div>'+
    '<progress aria-label="Записанные подходы" value="'+a.log.length+'" max="'+total+'"></progress>'+rest;
  if(!e)return progress+exerciseList(a)+recent(a)+'<h1>Готово</h1>'+button('Сохранить тренировку','finish','primary');
  const old=previous(e,a.set), last=a.log.filter(s=>s.id===e.id).at(-1);
  const reps=a.draft?.reps??last?.reps??old?.reps??Number(e.sets.match(/×\s*(\d+)/)?.[1]??1);
  const weight=a.draft?.weight??last?.weight??old?.weight??'';
  return progress+exerciseList(a)+recent(a)+'<div class="actions">'+button('Заменить сегодня','replace')+button('Пропустить упражнение','skip')+button('Завершить','early')+'</div>'+
    '<p class="hint">'+escape(e.sets)+' · '+escape(e.note)+'</p>'+
    '<form id="entry" class="dock"><div class="session-meta"><strong>'+escape(e.name)+'</strong><small>'+ (a.set+1)+'/'+e.count+'</small></div>'+
    (old?'<button type="button" data-action="previous" class="previous">В прошлый раз: '+escape(format(old,e))+' ↙</button>':'')+
    '<div class="fields">'+(e.weightLabel?counter('weight',e.weightLabel+' · кг',weight,0,2.5):'')+counter('reps',unit(e),reps,1,1)+'</div>'+
    '<button class="primary">✓ Записать подход</button></form>';
}
function history() {
  const sessions = [...state.history].reverse();
  const rows = sessions.map((a,rev) => {
    const date = new Date(a.finished).toLocaleDateString('ru-RU',{day:'numeric',month:'short', year:'numeric'});
    const exercises = a.day.exercises.map((e,index) => {
      const sets = a.log.filter(s => s.id === e.id);
      return sets.length ? '<li><b>'+escape(e.name)+'</b><small>'+sets.map(s=>escape(format(s,e))).join(' / ')+'</small>'+button('Исправить','historyedit-'+(sessions.length-1-rev)+'-'+index)+'</li>' : '';
    }).join('');
    return `<details class="record"><summary><small>${date}</small><strong>${escape(a.day.name)}</strong><span>${a.log.length} подх.</span></summary><ul>${exercises}</ul></details>`;
  }).join('');
  const empty = '<article class="empty"><h2>Пока нет тренировок</h2><p>Заверши занятие, и здесь появятся упражнения, веса и повторы.</p>'+button(state.active?'Вернуться к тренировке':'Выбрать тренировку','train')+'</article>';
  return '<h1>Журнал</h1>'+(rows || empty)+'<details class="backup"><summary>Резервная копия</summary><div class="actions">'+button('Скачать копию','export')+button('Восстановить','restore')+'</div></details><input id="backup" type="file" accept=".json" hidden>';
}

function render(){
  for(const tab of ['train','plans','journal']) byId(tab).setAttribute('aria-pressed',page===tab);
  view.innerHTML=page==='plans'?plansView():page==='journal'?history():state.active?active():overview();
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
    a.set++;
    a.undoable=true;
    const partner=e.pair && a.day.exercises.findIndex(other=>other.pair===e.pair && other.pairOrder!==e.pairOrder && logged(a,other)<other.count && !a.skipped.includes(other.id));
    if(Number.isInteger(partner) && partner>=0) selectExercise(a,partner);
    else if(a.set>=e.count) advance(a);
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
  if(action.startsWith('day-')){previewDay=selectedPlan(state).plan.days[Number(action.slice(4))].id;render();return;}
  if(action==='new-plan')return openPlanEditor();
  if(action.startsWith('modify:'))return openPlanEditor(state.customPlans.find(p=>p.id===action.slice(7)));
  if(action.startsWith('use:')) return commit(s=>{s.selectedId=action.slice(4);});
  if(action==='previous')return commit(s=>{
    const a=s.active, ex=a.day.exercises[a.index], old=previous(ex,a.set);
    if(!old)return;
    a.draft={weight:old.weight??'',reps:old.reps};
    (a.drafts??={})[ex.id]=a.draft;
  });
  if(action==='undo')return commit(s=>{
    const a=s.active;
    if(!a.undoable)return;
    const set=a.log.pop();
    selectExercise(a,a.day.exercises.findIndex(ex=>ex.id===set.id));
    a.draft={weight:set.weight??'',reps:set.reps};
    (a.drafts??={})[set.id]=a.draft;
    a.until=0;a.undoable=false;
  });
  if(action.startsWith('edit-')){editSets(Number(action.slice(5)));return;}
  if(action.startsWith('historyedit-')){
    const [,h,i]=action.split('-');editSets(Number(i),Number(h));return;
  }
  if(action==='replace'){replaceToday();return;}
  if(action==='train'){page='train';render();return;}
  if(action.startsWith('start-'))return commit(s=>{
    const selected=selectedPlan(s);
    previewDay=null;
    s.active={planId:selected.id,day:structuredClone(selected.plan.days[Number(action.slice(6))]),version:selected.plan.version,index:0,set:0,log:[],until:0,draft:null};
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
    link.download='TraningAssistant-journal.json';
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
    if(schema!==1 || !validPlan(data?.plan) || !validLibrary(data) || !Array.isArray(data.history) || !data.history.every(s=>validSession(s)&&Number.isFinite(s.finished)) || (data.active!==null && !validSession(data.active)))throw Error();
    if(confirm('Восстановить журнал, тренировку и сохранённые планы из копии?') && save({...data,plan:state.plan,customPlans:data.customPlans??state.customPlans??[],selectedId:data.selectedId??(data.customPlans?originalPlanId:state.selectedId)}))render();
  }catch{byId('notice').textContent='Не удалось прочитать резервную копию приложения «TraningAssistant».';}
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
  for(const tab of ['train','plans','journal'])byId(tab).onclick=()=>{page=tab;render();};
  setInterval(tick,500);
  if('serviceWorker' in navigator){
    try{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;byId('offline').textContent='Готово к офлайн';}
    catch{byId('offline').textContent='Только онлайн';}
  }
}
init().catch(()=>{view.textContent='Не удалось открыть план. Проверь соединение и доступ к хранилищу браузера, затем обнови страницу.';});






