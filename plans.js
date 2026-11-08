'use strict';
const originalPlanId = 'vshape';
const compactPlanId = 'compact';
function catalog(s) {
  const source = s.plan;
  const ready = [{id:originalPlanId,name:'V-Shape · два дня',plan:source}];
  const compactDays = source.days.map(day => ({
    ...day,id:'compact-'+day.id,exercises:day.exercises.slice(0,3).map(ex=>({...ex,pair:undefined}))
  }));
  ready.push({id:compactPlanId,name:'Короткая программа · по три упражнения',plan:{version:source.version,days:compactDays}});
  return ready.concat(s.customPlans || []);
}
function selectedPlan(s) {
  const plans=catalog(s);
  return plans.find(p=>p.id===s.selectedId) || plans[0];
}
function validLibrary(data) {
  return data.customPlans === undefined || (Array.isArray(data.customPlans) && data.customPlans.every(p=>
    typeof p?.id==='string' && typeof p.name==='string' && validPlan(p.plan)));
}
function plansView() {
  const selected=selectedPlan(state);
  const cards=catalog(state).map(item=>{
    const custom=(state.customPlans || []).some(p=>p.id===item.id);
    const current=item.id===selected.id;
    const days=item.plan.days.map(d=>'<li><b>'+escape(d.name)+'</b><small>'+d.exercises.map(e=>escape(e.name)).join(' · ')+'</small></li>').join('');
    return '<article class="day"><small>'+(custom?'Мой план':'Готовый план')+(current?' · Выбран':'')+'</small><h2>'+escape(item.name)+'</h2><details><summary>Посмотреть программу</summary><ol>'+days+'</ol></details><div class="actions">'+
      (current?'':button('Выбрать','use:'+item.id))+(custom?button('Изменить','modify:'+item.id):'')+'</div></article>';
  });
  return '<h1>Планы</h1>'+button('Создать свой план','new-plan','primary')+cards.join('');
}
function exerciseFields(ex={}) {
  const box=document.createElement('fieldset');
  box.className='builder-ex';
  box.dataset.id=ex.id || crypto.randomUUID();
  const target=ex.sets?.split(' × ')[1] || '8–12';
  box.innerHTML='<label>Упражнение<input required name="exercise" maxlength="100" placeholder="Например, жим гантелей" value="'+escape(ex.name)+'"></label>'+
    '<div class="builder-grid"><label>Подходы<input required type="number" name="count" min="1" max="99" value="'+(ex.count??3)+'"></label>'+
    '<label>Повторы или время<input required name="target" maxlength="60" value="'+escape(target)+'"></label>'+
    '<label>Отдых, сек<input required type="number" name="rest" min="0" max="3600" value="'+(ex.restSeconds??90)+'"></label></div>'+
    '<label><input type="checkbox" name="weighted" '+(ex.weightLabel!==''?'checked':'')+'> Записывать вес</label>'+
    '<label>Стартовый вес, кг<input type="number" name="startWeight" min="0" step="any" placeholder="Не задан" value="'+escape(ex.startWeight)+'"></label>'+
    '<button type="button" data-remove>Убрать упражнение</button>';
  const weighted=box.querySelector('[name=weighted]'), startWeight=box.querySelector('[name=startWeight]');
  weighted.onchange=()=>{startWeight.disabled=!weighted.checked;startWeight.parentElement.hidden=!weighted.checked;};
  weighted.onchange();
  box.querySelector('[data-remove]').onclick=()=>{
    if(box.parentElement.children.length>1)box.remove();
    else box.querySelector('[name=exercise]').focus();
  };
  return box;
}
function dayFields(day, number) {
  const box=document.createElement('section');
  box.className='builder-day';
  box.dataset.id=day?.id || crypto.randomUUID();
  box.innerHTML='<label>Название дня<input required name="dayName" maxlength="80" value="'+escape(day?.name??('День '+number))+'"></label><div class="builder-exercises"></div><div class="actions"><button type="button" data-add>+ Упражнение</button><button type="button" data-remove>Убрать день</button></div>';
  const exercises=box.querySelector('.builder-exercises');
  for(const ex of day?.exercises??[{}])exercises.append(exerciseFields(ex));
  box.querySelector('[data-add]').onclick=()=>{const row=exerciseFields();exercises.append(row);row.querySelector('input').focus();};
  box.querySelector('[data-remove]').onclick=()=>{
    if(box.parentElement.children.length>1)box.remove();
    else box.querySelector('[name=dayName]').focus();
  };
  return box;
}
function openPlanEditor(existing) {
  const dialog=showDialog(existing?'Изменить план':'Новый план','<form class="plan-builder"><label>Название плана<input required name="title" maxlength="80" placeholder="Моя программа" value="'+escape(existing?.name)+'"></label><div class="builder-days"></div><button type="button" data-day>+ День</button><button class="primary">Сохранить и выбрать</button></form>');
  const form=dialog.querySelector('form'), days=form.querySelector('.builder-days');
  for(const day of existing?.plan.days??[null]) days.append(dayFields(day,days.children.length+1));
  form.querySelector('[data-day]').onclick=()=>{const row=dayFields(null,days.children.length+1);days.append(row);row.querySelector('input').focus();};
  form.onsubmit=event=>{
    event.preventDefault();
    for(const input of form.querySelectorAll('input[required]'))input.value=input.value.trim();
    if(!form.reportValidity())return;
    const plan={version:(existing?.plan.version??0)+1,days:Array.from(days.children,box=>({
      id:box.dataset.id,name:box.querySelector('[name=dayName]').value,
      exercises:Array.from(box.querySelectorAll('.builder-ex'),row=>{
        const val=name=>row.querySelector('[name='+name+']').value;
        const count=Number(val('count'));
        return {id:row.dataset.id,name:val('exercise'),count,sets:count+' × '+val('target'),restSeconds:Number(val('rest')),
          weightLabel:row.querySelector('[name=weighted]').checked?'Рабочий вес':'',
          startWeight:row.querySelector('[name=weighted]').checked && val('startWeight')!==''?Number(val('startWeight')):null,note:''};
      })
    }))};
    const item={id:existing?.id??crypto.randomUUID(),name:form.elements.title.value,plan};
    const next=structuredClone(state);
    next.customPlans=(next.customPlans||[]).filter(p=>p.id!==item.id).concat(item);
    next.selectedId=item.id;
    if(save(next)){dialog.close();render();}
  };
}
