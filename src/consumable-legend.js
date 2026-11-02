import { CONSUMABLE_TYPES, DEN_HAY, consumableDetails } from './consumable-data.js';

// Read the same reward definitions as consumption, so balancing an item cannot
// leave the reference board showing an older reward.
export function consumableLegendRows() {
  const special=consumableDetails(DEN_HAY),poop=consumableDetails({type:'poop'});
  return [
    {id:DEN_HAY.id,...special,refill:true},
    ...Object.entries(CONSUMABLE_TYPES).map(([id,item])=>({id,...item})),
    {id:'poop',...poop,color:0x785032},
    {id:'water',name:'Water',energy:0,happiness:0,color:0x84cbdc},
  ];
}

export function renderConsumableLegend(body) {
  const document=body.ownerDocument;
  body.replaceChildren(...consumableLegendRows().map(item=>{
    const row=document.createElement('tr');row.dataset.legendItem=item.id;
    const name=document.createElement('th');name.scope='row';
    const dot=document.createElement('i');dot.className='legend-item-dot';dot.setAttribute('aria-hidden','true');
    dot.style.backgroundColor=`#${item.color.toString(16).padStart(6,'0')}`;
    const label=document.createElement('span');label.textContent=item.name;name.append(dot,label);
    const energy=document.createElement('td'),happiness=document.createElement('td');
    energy.textContent=item.refill ? '100%' : item.energy ? `+${item.energy}` : '0';
    if(item.refill) energy.title='Refills energy to 100%';
    happiness.textContent=item.happiness ? `+${item.happiness}` : '0';
    row.append(name,energy,happiness);return row;
  }));
}
