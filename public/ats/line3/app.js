(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const stations = window.LINE3_STATIONS;
  const NS = 'http://www.w3.org/2000/svg';
  const layout = window.LINE3_LAYOUT;
  const assets = window.LINE3_ASSETS, BLOCK = 125;
  let edge = 40;
  stations.forEach((s,i) => {
    const a=assets[i],u=a.upper.indexOf(a.platformUpper),l=a.lower.indexOf(a.platformLower);
    const left=Math.max(u+.5,l+.5,-Math.min(...a.signalOffsetsUpper,...a.signalOffsetsLower),i===6?5:0)+.8;
    const right=Math.max(a.upper.length-u-.5,a.lower.length-l-.5,...a.signalOffsetsUpper,...a.signalOffsetsLower)+.8;
    s.left=edge;s.x=edge+left*BLOCK;s.right=s.x+right*BLOCK;edge=s.right;
  });
  const WORLD_W = edge+40, WORLD_H = 960;
  let trackDefs=[],signalDefs=[],pointDefs=[];
  function trackX(i,row,id,f=.5) {
    const a=assets[i],ids=row==='upper'?a.upper:a.lower,platform=row==='upper'?a.platformUpper:a.platformLower;
    return stations[i].x+(ids.indexOf(id)-ids.indexOf(platform)+f-.5)*BLOCK;
  }
  const svg = $('trackSvg'), scene = $('scene'), stage = $('stage');
  const icon = (id, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pad = n => String(n).padStart(2, '0');
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem('line3-workspace-v1') || '{}') || {}; } catch {}
  let selected = Math.max(0, Math.min(21, Number(stored.selected) || 0));
  let saved = new Set(Array.isArray(stored.saved) ? stored.saved.filter(n => Number.isInteger(n) && n >= 0 && n < 22) : []);
  let notes = stored.notes && typeof stored.notes === 'object' ? stored.notes : {};
  if(notes['3C3']&&!notes['3D3'])notes['3D3']=notes['3C3'];
  let labels = stored.labels !== false, savedOnly = false;
  let diagramView=stored.diagramView!==false;
  let layoutRows=layout.normalizeRows(stored.layoutRows);
  let views=[svg];
  document.body.classList.toggle("diagram-view",diagramView);
  let camera = { x: 0, y: 0, w: 2000, h: 820 }, asset = null;
  let demo = false, running = false, lastFrame = 0, raf = 0;
  let signalStates = {}, pointStates = {}, lastToast = 0, storageNotice = false;
  const trains = [{id:'DEMO 01',x:700,dir:1,color:'#d47d3b'},{id:'DEMO 02',x:5200,dir:-1,color:'#4f8d82'},{id:'DEMO 03',x:10200,dir:1,color:'#d47d3b'}];

  function persist() {
    try { localStorage.setItem('line3-workspace-v1', JSON.stringify({ selected, saved:[...saved], notes, labels, diagramView, layoutRows, dark:document.body.classList.contains('dark') })); }
    catch { if (!storageNotice) { toast('Browser storage is unavailable. Export notes to keep them.'); storageNotice = true; } }
  }
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(lastToast); lastToast = setTimeout(() => $('toast').classList.remove('visible'), 3500); }
  function activity(message) { $('activityText').textContent = message; }
  function el(tag, attrs = {}, parent = scene, text = '') {
    const element = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key,value]) => element.setAttribute(key, value));
    if (text) element.textContent = text;
    parent.appendChild(element); return element;
  }
  function railY(i, upper) { return stations[i].type === 'island' || stations[i].type === 'pocket' ? (upper ? 285 : 555) : (upper ? 330 : 510); }
  function yAt(x, upper) {
    const i=Math.max(0,stations.findIndex(s=>x<=s.right)),s=stations[i];
    const normal=upper?330:510,expanded=railY(i,upper),d=Math.abs(x-s.x);
    return normal+(expanded-normal)*Math.max(0,Math.min(1,(300-d)/100));
  }
  function drawRails() {
    [true,false].forEach(upper=>{
      const xs=[40,...stations.flatMap(s=>[s.left,s.x-300,s.x-200,s.x+200,s.x+300,s.right]),WORLD_W-40].filter(x=>x>=40&&x<=WORLD_W-40).sort((a,b)=>a-b);
      el('path',{d:xs.map((x,j)=>`${j?'L':'M'} ${x} ${yAt(x,upper)}`).join(' '),class:'rail'});
      [40,WORLD_W-40].forEach(x=>el('path',{d:`M ${x} ${yAt(x,upper)-10} v 20`,class:'rail-muted','stroke-width':4}));
    });
    trackDefs=[];
    stations.forEach((s,i)=>['upper','lower'].forEach(row=>{
      assets[i][row].forEach(id=>{
        const x=trackX(i,row,id),upper=row==='upper',y=yAt(x,upper);
        trackDefs.push({key:id,id,i,row,x,y,location:`${upper?'Upper':'Lower'} main track`});
        drawTrackLabel(trackDefs.at(-1));
        const end=x+BLOCK/2,ey=yAt(end,upper);
        el('path',{d:`M ${end-3} ${ey-6} v 12 M ${end+3} ${ey-6} v 12`,class:'rail block-boundary','stroke-width':1.4});
      });
      if(row==='upper')el('path',{d:`M ${s.left} 235 v 410`,class:'sector-boundary'});
    }));
  }
  function drawTrackLabel(def,parent=scene) {
    const {id,i,x,y,row}=def,upper=row==='upper';
    const g=el('g',{'data-track':id,class:`asset-group track-group ${asset?.kind==='track'&&asset.key===id?'selected-asset':''}`},parent);
    el('rect',{x:x-48,y:y-48,width:96,height:96,rx:4,class:'asset-hit'},g);
    el('text',{x,y:y+(def.labelDy??(upper?39:-28)),'text-anchor':'middle',class:'track-id asset-label'},g,id);
    el('title',{},g,`Track ${id} · ${stations[i].name} · ${def.location}`);
  }
  function platform(parent,x,y,label) {
    el('path',{d:`M ${x-62} ${y-8} V ${y+8} H ${x+62} V ${y-8}`,class:'platform'},parent);
    el('path',{d:`M ${x-58} ${y-14} H ${x+58}`,class:'rail-muted','stroke-dasharray':'11 5'},parent);
    el('text',{x,y:y+29,'text-anchor':'middle',class:'platform-label'},parent,label);
  }
  function drawStations() {
    stations.forEach((s,i)=>{
      const g=el('g',{'data-station':i,class:'station-group'});
      el('rect',{x:s.x-205,y:73,width:410,height:600,rx:18,class:`station-hit ${i===selected?'station-selected':''}`},g);
      const words=s.name.split(' '),long=s.name.length>23;
      if(long){const split=Math.ceil(words.length/2);el('text',{x:s.x,y:112,'text-anchor':'middle',class:'station-title'},g,words.slice(0,split).join(' '));el('text',{x:s.x,y:136,'text-anchor':'middle',class:'station-title'},g,words.slice(split).join(' '));}
      else el('text',{x:s.x,y:124,'text-anchor':'middle',class:'station-title'},g,s.name);
      el('text',{x:s.x,y:long?162:154,'text-anchor':'middle',class:'station-arabic'},g,s.arabic);
      el('text',{x:s.x,y:long?188:181,'text-anchor':'middle',class:'station-code'},g,`[ ${s.code} ]`);
      el('text',{x:s.x,y:long?211:207,'text-anchor':'middle',class:'status-text'},g,'GTS     IXL     AU     CC     VA');
      const island=s.type==='island'||s.type==='pocket';
      platform(g,s.x,island?370:246,assets[i].platformUpper);
      platform(g,s.x,island?478:624,assets[i].platformLower);
    });
    signalDefs=[];
    stations.forEach((s,i)=>{
      const a=assets[i];
      ['upper','lower'].forEach(row=>a[row==='upper'?'signalsUpper':'signalsLower'].forEach((id,j)=>{
        const x=s.x+a[row==='upper'?'signalOffsetsUpper':'signalOffsetsLower'][j]*BLOCK;
        signalDefs.push({key:id,id,i,row,x,y:yAt(x,row==='upper')+(row==='upper'?-62:62)});
      }));
      a.extraSignals.forEach(sig=>signalDefs.push({...sig,key:sig.id,i,x:s.x+sig.offset*BLOCK,y:sig.row==='centre'?386:845}));
    });
    const previousSignals=new Map();
    signalDefs.forEach(def=>{
      const key=`${def.i}-${def.row}`,previous=previousSignals.get(key);
      const gap=previous?(previous.id.length+def.id.length)*7.4+12:0;
      def.labelLane=previous&&def.x-previous.x<gap&&!previous.labelLane?1:0;
      previousSignals.set(key,def);
    });
    signalDefs.forEach(drawSignal);
  }
  function drawSignal(def) {
    const {id,key,i,x,y,row}=def,upper=row==='upper'||row==='centre',square=id.startsWith('MV')||id==='S0407';
    const g=el('g',{'data-signal':key,class:`asset-group signal-group ${asset?.kind==='signal'&&asset.key===key?'selected-asset':''}`});
    el('rect',{x:x-48,y:y-26,width:96,height:65,rx:5,class:'asset-hit'},g);
    el('path',{d:`M ${x} ${y} h ${upper?19:-19} m 0 -7 v 14`,class:'signal-post'},g);
    el(square?'rect':'circle',square?{x:x-8,y:y-8,width:16,height:16,class:'signal-body','data-signal-light':key}:{cx:x,cy:y,r:8,class:'signal-body','data-signal-light':key},g);
    el('text',{x:row==='centre'?x-82:x,y:row==='centre'?y+8:y+(upper?-23:39)+(def.labelLane||0)*(upper?-34:34),'text-anchor':'middle',class:'signal-id asset-label'},g,id);
    el('title',{},g,`${id} · ${stations[i].name} · ${row} signal. Click to inspect.`);
  }
  function addPoint(id,i,x,y,connection) {
    const key=id,def={key,id,i,x,y,connection};pointDefs.push(def);
    const g=el('g',{'data-point':key,class:`asset-group point-group ${asset?.kind==='point'&&asset.key===key?'selected-asset':''}`});
    el('rect',{x:x-24,y:y-18,width:48,height:38,rx:4,class:'asset-hit'},g);
    el('path',{d:`M ${x-9} ${y-7} h 18 v 14 h -18 Z`,class:'point-body','data-point-light':key},g);
    const above=y>=500;
    const crowded=pointDefs.some(p=>p.key!==key&&p.i===i&&Math.abs(p.x-x)<60&&Math.abs(p.y-y)<20);
    el('text',{x:x+(i===6&&id!=='09'?-40:crowded?-42:y===420?42:16),y:y+(y===420?25:i===6&&id==='07'?-66:above?-73:83),'text-anchor':'middle',class:'point-id asset-label'},g,id);
    el('title',{},g,`Point ${id} · ${stations[i].name} · ${connection}`);
  }
  function branchPath(d,keys) {
    el('path',{d,class:'rail-muted crossover-path','data-point-path':keys.join(' ')});
  }
  function drawPoints() {
    pointDefs=[];
    assets.forEach((a,i)=>a.connections.forEach(c=>{
      let ux=trackX(i,'upper',c.upper.track,c.upper.f),lx=trackX(i,'lower',c.lower.track,c.lower.f);
      if(Math.abs(ux-lx)<60){ux-=60;lx+=60;}
      const uy=yAt(ux,true),ly=yAt(lx,false),ids=[c.upper.id,c.lower.id];
      branchPath(`M ${ux} ${uy} L ${lx} ${ly}`,ids);
      el('path',{d:`M ${(ux+lx)/2-5} ${(uy+ly)/2+5} l 10 -10`,class:'rail-muted'});
      addPoint(ids[0],i,ux,uy,`Crossover to point ${ids[1]}`);addPoint(ids[1],i,lx,ly,`Crossover to point ${ids[0]}`);
    }));
    // Sultanah centre track: one common stem splits to the two main rails.
    {
      const i=6,s=stations[i],stem=s.x-230,tip=s.x-75,start=s.x-560,y=420;
      branchPath(`M ${start} ${y} H ${stem}`,['09']);
      branchPath(`M ${stem} ${y} L ${tip} ${yAt(tip,true)}`,['09','08']);
      branchPath(`M ${stem} ${y} L ${tip} ${yAt(tip,false)}`,['09','07']);
      el('path',{d:`M ${start} ${y-10} v 20`,class:'rail-muted','stroke-width':4});
      [start+100,start+200].forEach(x=>el('path',{d:`M ${x} ${y-5} v 10`,class:'rail-muted'}));
      el('text',{x:start+165,y:498,class:'unresolved-label','text-anchor':'middle'},scene,'CENTRE TRACK · IDs unclear');
      [{id:'0716',x:stem-55,y:420,row:'centre',labelDy:39,location:'Centre track stem'},{id:'0717',x:(stem+tip)/2+28,y:480,row:'branch',location:'Lower centre-track connection'}].forEach(d=>{trackDefs.push({...d,key:d.id,i});drawTrackLabel(trackDefs.at(-1));});
      addPoint('09',i,stem,y,'Centre stem to points 07 / 08');addPoint('08',i,tip,yAt(tip,true),'Centre track to point 09');addPoint('07',i,tip,yAt(tip,false),'Centre track to point 09');
    }
    // Jarir CS-1 siding below the lower main line. The CS-2 crossover is above.
    {
      const i=16,s=stations[i],left=s.x-7.1*BLOCK,right=s.x-2.7*BLOCK,y=750;
      const d=`M ${left} ${yAt(left,false)} L ${left+90} ${y} H ${right-90} L ${right} ${yAt(right,false)}`;
      branchPath(d,['19','21']);
      el('text',{x:(left+right)/2,y:680,'text-anchor':'middle',class:'siding-name'},scene,'CS-1');
      assets[i].siding.forEach((id,j)=>{
        const x=left+20+j*(right-left-40)/7,ty=j===0||j===7?625:y;
        trackDefs.push({id,key:id,i,row:'siding',x,y:ty,labelDy:j===0||j===7?32:j%2===0?-31:43,location:'CS-1 siding'});drawTrackLabel(trackDefs.at(-1));
      });
      addPoint('19',i,left,yAt(left,false),'CS-1 siding to point 21');addPoint('21',i,right,yAt(right,false),'CS-1 siding to point 19');
      el('text',{x:s.x-2.2*BLOCK,y:420,class:'siding-name'},scene,'CS-2');
    }
  }
  function drawDiagram() {
    const section=selected<7?'WESTERN':selected<15?'CENTRAL':'EASTERN';
    $('stageContext').innerHTML=`${section} SECTION <b>→ KHASHM AL AN</b>`;
    scene.replaceChildren();drawRails();drawStations();drawPoints();
    scene.querySelectorAll(".track-group").forEach(g=>scene.appendChild(g));
    trains.forEach(t=>{const g=el('g',{'data-train':t.id,display:demo?'':'none'});el('rect',{x:-55,y:-14,width:110,height:28,rx:6,fill:t.color},g);[-20,20].forEach(x=>el('path',{d:`M ${x} -11 V 11`,stroke:'#ffffff66','stroke-width':1},g));el('text',{x:0,y:-23,'text-anchor':'middle',class:'train-label',style:`fill:${t.color}`},g,t.id);});
    syncSceneCopies();paintStates();updateTrainPositions();drawMinimap();
  }
  function syncSceneCopies() {
    views.slice(1).forEach(view=>{
      const copy=scene.cloneNode(true);copy.removeAttribute('id');view.replaceChildren(copy);
    });
    views.forEach(view=>view.classList.toggle('labels-off',!labels));
  }
  function setLayoutRows(value,{focus=true}={}) {
    layoutRows=layout.normalizeRows(value);
    const container=$('diagramRows');
    container.querySelectorAll('.diagram-row:not(:first-child)').forEach(row=>row.remove());
    views=[svg];
    for(let row=1;row<layoutRows;row++){
      const panel=document.createElement('div');panel.className='diagram-row';
      const view=el('svg',{class:'track-svg',role:'img',tabindex:0,'data-row':row,'aria-label':`Track diagram row ${row+1} of ${layoutRows}. Pan and zoom; select an asset.`},panel);
      const badge=document.createElement('span');badge.className='row-label';panel.appendChild(badge);
      container.appendChild(panel);views.push(view);
    }
    container.dataset.rows=layoutRows;
    svg.setAttribute('aria-label',`Track diagram row 1 of ${layoutRows}. Pan and zoom; select an asset.`);
    document.querySelectorAll('[data-layout-rows]').forEach(button=>button.setAttribute('aria-pressed',Number(button.dataset.layoutRows)===layoutRows));
    syncSceneCopies();persist();
    if(focus)requestAnimationFrame(()=>focusStation());
  }
  function paintStates() {
    stage.querySelectorAll('[data-signal-light]').forEach(light=>{const state=signalStates[light.dataset.signalLight]||'green';light.style.fill=demo?(state==='red'?'#d65e50':'#69a563'):'';light.style.stroke=demo?(state==='red'?'#a3483d':'#467744'):'';});
    stage.querySelectorAll('[data-point-path]').forEach(path=>{path.style.stroke=demo&&path.dataset.pointPath.split(' ').some(k=>pointStates[k])?'#db9147':'';path.style.strokeWidth=demo&&path.dataset.pointPath.split(' ').some(k=>pointStates[k])?'4':'';});
    stage.querySelectorAll('[data-point-light]').forEach(path=>{path.style.fill=demo&&pointStates[path.dataset.pointLight]?'#edaa59':'';});
  }
  function updateTrainPositions() { trains.forEach(t=>stage.querySelectorAll(`[data-train="${t.id}"]`).forEach(g=>g.setAttribute('transform',`translate(${t.x},${yAt(t.x,t.dir===1)})`))); }
  function applyCamera() {
    camera=layout.constrainCamera(camera,{width:svg.clientWidth,height:svg.clientHeight,rows:layoutRows,worldWidth:WORLD_W,worldHeight:WORLD_H});
    views.forEach((view,row)=>{
      const box=layout.rowViewBox(camera,row);
      view.setAttribute('viewBox',`${box.x} ${box.y} ${box.w} ${box.h}`);
      const visible=stations.filter(s=>s.right>=box.x&&s.left<=box.x+box.w);
      const badge=view.parentElement.querySelector('.row-label');
      badge.textContent=`${row+1} / ${layoutRows}${visible.length?' · '+visible[0].code+' → '+visible.at(-1).code:''}`;
    });
    $('zoomValue').textContent=Math.round(2000/camera.w*100)+'%';
    drawMinimap();
  }
  function focusStation(i=selected) {
    const siding=i===16;
    const scale=Math.min(1.1,Math.max(layoutRows===1?.65:.12,svg.clientHeight/(siding?900:660)));
    const w=svg.clientWidth/scale,h=svg.clientHeight/scale;
    camera={x:Math.max(0,Math.min(WORLD_W-w*layoutRows,stations[i].x-w*.5)),y:(siding?450:385)-h/2,w,h};applyCamera();
  }
  function fitView() {
    const w=WORLD_W/layoutRows,h=WORLD_H;
    const aspect=svg.clientWidth/Math.max(1,svg.clientHeight);
    const desiredW=Math.max(w+100,(h+100)*aspect),desiredH=desiredW/aspect;
    camera={x:(WORLD_W-desiredW*layoutRows)/2,y:(h-desiredH)/2,w:desiredW,h:desiredH};applyCamera();
  }
  function zoom(factor,cx=layoutRows/2,cy=.5) {camera=layout.zoomCamera(camera,factor,cx,cy,layoutRows);applyCamera();}
  function drawMinimap() {
    const map=$('minimap');map.replaceChildren();
    el('path',{d:'M 22 28 H 1078',stroke:'#c6d3c7','stroke-width':3},map);
    const positions=stations.map(s=>22+s.x/WORLD_W*1056);
    {const x=22+camera.x/WORLD_W*1056,w=camera.w*layoutRows/WORLD_W*1056;el('rect',{x:Math.max(12,x),y:14,width:Math.max(15,Math.min(w,1088-Math.max(12,x))),height:28,rx:5,fill:'#e88b3820',stroke:'#d69a60','stroke-width':1.2},map);}
    stations.forEach((s,i)=>{const g=el('g',{'data-map-station':i,class:'map-station'},map);el('circle',{cx:positions[i],cy:28,r:16,fill:'transparent',stroke:'none'},g);el('circle',{cx:positions[i],cy:28,r:i===selected?6:3.5,fill:i===selected?'#de833c':'#f7faf5',stroke:i===selected?'#de833c':'#8fa58d','stroke-width':1.5},g);if([0,3,6,9,13,17,21].includes(i))el('text',{x:positions[i],y:57,'text-anchor':'middle',fill:'#8c9c91','font-size':11,'font-family':'Consolas,monospace',stroke:'none'},g,s.code);el('title',{},g,s.name);});
    $('navigatorStation').textContent=`${pad(selected+1)} / 22`;
  }
  function renderStationList() {
    const q=$('stationSearch').value.trim().toLowerCase();
    const filtered=stations.filter(s=>(!savedOnly||saved.has(s.index))&&`${s.name} ${s.code} ${s.arabic} ${assetIds(s.index).join(' ')} ${pointIds(s.index).map(id=>'point '+id).join(' ')}`.toLowerCase().includes(q));
    $('stationList').innerHTML=filtered.length?filtered.map(s=>`<button class="station-item ${s.index===selected?'active':''}" data-nav-station="${s.index}" aria-current="${s.index===selected?'location':'false'}"><span class="station-node"></span><span class="station-text"><strong>${esc(s.name)}</strong><small>${s.code}${saved.has(s.index)?' · ★':''}${q&&assetIds(s.index).some(id=>id.toLowerCase().includes(q))?' · '+esc(assetIds(s.index).filter(id=>id.toLowerCase().includes(q)).slice(0,2).join(', ')):''}</small></span><span class="station-number">${pad(s.index+1)}</span></button>`).join(''):`<div class="empty-state">${savedOnly?'No saved stations match. Use the star in a station’s inspector to save it.':'No match. Try a station, S1504, 0415B or point 26.'}</div>`;
    $('savedCount').textContent=saved.size;
  }
  function selectStation(i,{focus=true,open=true}={}) {
    selected=Math.max(0,Math.min(21,i));asset=null;
    renderStationList();renderInspector();persist();
    drawDiagram();if(focus)focusStation();
    $('stationSidebar').classList.remove('open');if(open&&(diagramView||window.innerWidth<=1000))$('inspector').classList.add('open');
    const section=selected<7?'WESTERN':selected<15?'CENTRAL':'EASTERN';
    $('stageContext').innerHTML=`${section} SECTION <b>→ KHASHM AL AN</b>`;
    activity(`${stations[selected].name} selected · Explore its signals, points and platforms.`);
  }
  function pointIds(i) { return [...assets[i].connections.flatMap(c=>[c.upper.id,c.lower.id]),...(assets[i].extraPoints||[])]; }
  function assetIds(i) { const a=assets[i];return [...a.upper,...a.lower,...a.signalsUpper,...a.signalsLower,...a.extraTracks.map(t=>t.id),...a.extraSignals.map(s=>s.id),...pointIds(i)]; }
  function assetDescription() {
    if(!asset)return '';
    const isSignal=asset.kind==='signal',isTrack=asset.kind==='track';
    const def=(isSignal?signalDefs:isTrack?trackDefs:pointDefs).find(d=>d.key===asset.key);
    const state=isSignal?(signalStates[asset.key]||'green'):(pointStates[asset.key]?'reverse':'normal');
    return `<div class="asset-inspection"><h3>${isSignal?'Signal':isTrack?'Track':'Point'} <b>${esc(asset.key)}</b></h3><p>${esc(isTrack?def.location:isSignal?`${def.row} track · ${asset.key.startsWith('MV')?'square signal':'signal'}`:def.connection)}</p>${isTrack?'':`<p>${demo?(isSignal?'Change the demo aspect. Demo trains stop at red main-track signals.':'Change the displayed point position. Demo trains stay on the main tracks.'):'Run demo to try display changes.'}</p><div class="asset-actions">${(isSignal?['red','green']:['normal','reverse']).map(value=>`<button data-asset-state="${value}" ${demo?'':'disabled'} class="${demo&&state===value?'active':''}">${isSignal?(value==='red'?'● Stop':'● Clear'):(value==='normal'?'Normal':'Reverse')}</button>`).join('')}</div>`}</div>`;
  }
  function assetRegister(i) {
    const a=assets[i],chips=(kind,ids)=>ids.map(id=>`<button class="asset-chip ${asset?.key===id?'active':''}" data-inspect-kind="${kind}" data-inspect-id="${id}">${id}</button>`).join('');
    return `<section class="detail-section asset-register"><h3>ATS ASSET NUMBERS</h3><div class="register-label">Upper track</div><div class="asset-chips tracks">${chips('track',a.upper)}</div><div class="register-label">Lower track</div><div class="asset-chips tracks">${chips('track',a.lower)}</div>${a.extraTracks.length?`<div class="register-label">Centre / siding tracks</div><div class="asset-chips tracks">${chips('track',a.extraTracks.map(t=>t.id))}</div>`:''}<div class="register-label">Signals</div><div class="asset-chips">${chips('signal',[...a.signalsUpper,...a.signalsLower,...a.extraSignals.map(s=>s.id)])}</div>${pointIds(i).length?`<div class="register-label">Points</div><div class="asset-chips points">${chips('point',pointIds(i))}</div>`:''}${a.unresolved.map(note=>`<p class="section-note unresolved-note">${esc(note)}</p>`).join('')}<p class="section-note asset-caption">IDs transcribed from your ATS photos. Spacing and geometry are schematic.</p></section>`;
  }
  function renderInspector() {
    const s=stations[selected],typeNames={terminal:'Terminal area',pocket:'Centre track',through:'Through station',island:'Centre platforms'};
    $('compactName').textContent=s.name;$('compactCode').textContent=`LINE 3 · ${s.code} · ${demo?(running?'DEMO':'DEMO PAUSED'):'SCHEMATIC'}`;
    $('viewTitle').textContent=s.name;$('viewEyebrow').textContent=`LINE 3 · ${s.code} · ATS ASSET DIAGRAM`;
    const previous=stations[selected-1],next=stations[selected+1];
    $('inspectorContent').innerHTML=`<div class="station-details"><span class="detail-code">${s.code}</span><button id="saveStation" class="icon-btn detail-save ${saved.has(selected)?'saved':''}" title="${saved.has(selected)?'Remove saved station':'Save station'}" aria-label="${saved.has(selected)?'Remove saved station':'Save station'}" aria-pressed="${saved.has(selected)}">${icon('star')}</button><h2>${esc(s.name)}</h2><div class="detail-arabic" lang="ar">${esc(s.arabic)}</div><div class="detail-sub"><span>STATION ${pad(selected+1)} OF 22</span><span class="layout-pill">${typeNames[s.type]}</span></div>${assetDescription()}${assetRegister(selected)}<section class="detail-section"><h3>ON THE DIAGRAM</h3><div class="asset-row"><span>Line</span><strong>03 · Riyadh Metro</strong></div><div class="asset-row"><span>Previous station</span><strong>${previous?previous.code:'Western end'}</strong></div><div class="asset-row"><span>Next station</span><strong>${next?next.code:'Eastern end'}</strong></div><div class="asset-row"><span>Display</span><strong>${demo?'Demo simulation':'Track diagram'}</strong></div></section><section class="detail-section" style="margin-top:0"><h3>YOUR STATION NOTES</h3><textarea id="stationNote" class="note-field" placeholder="Add a detail to check, a label, or a project note…" aria-label="Station notes">${esc(notes[s.code]||'')}</textarea><div class="note-footer"><span>Saved in this browser</span><button id="exportNotes" class="text-btn">${icon('download')}Export notes</button></div></section><div class="inspector-nav"><button id="previousStation" ${selected===0?'disabled':''}>${icon('arrow','reverse')}Previous</button><button id="nextStation" ${selected===21?'disabled':''}>Next${icon('arrow')}</button></div></div>`;
  }
  function updateDemoUI() {
    $('demoBtn').setAttribute('aria-label',running?'Pause demo':demo?'Resume demo':'Run demo');
    $('demoBtn').classList.toggle('running',running);$('demoBtn').innerHTML=icon(running?'pause':'play')+`<span>${running?'Pause demo':demo?'Resume demo':'Run demo'}</span>`;
    $('modeBadge').classList.toggle('demo',demo);$('modeBadge').innerHTML=`<i></i>${demo?(running?'DEMO RUNNING':'DEMO PAUSED'):'SCHEMATIC'}`;
    $('stageModel').textContent=demo?'SIMULATED DISPLAY':'SCHEMATIC MODEL';$('resetDemo').hidden=!demo;
    $('modelNote').textContent=demo?'Illustrative simulation · No live connection':'Schematic geometry · Interactive model';
    renderInspector();
  }
  function toggleDemo() {
    demo=true;running=!running;drawDiagram();updateDemoUI();
    if(running){lastFrame=0;cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);activity('Demo running. Click a signal or point to explore the display.');}
    else {cancelAnimationFrame(raf);activity('Demo paused. Display settings are retained.');}
  }
  function frame(time) {
    if(!running)return;
    const dt=lastFrame?Math.min((time-lastFrame)/1000,.12):0;lastFrame=time;
    trains.forEach(t=>{
      let step=dt*92*t.dir;
      const ahead=signalDefs.filter(sig=>sig.row===(t.dir===1?'upper':'lower')).filter(sig=>(signalStates[sig.key]||'green')==='red'&&(sig.x-t.x)*t.dir>=55).sort((a,b)=>(a.x-b.x)*t.dir)[0];
      if(ahead&&Math.abs(ahead.x-t.x)-55<Math.abs(step))step=t.dir*Math.max(0,Math.abs(ahead.x-t.x)-55);
      t.x+=step;if(t.x>WORLD_W-45)t.x=45;if(t.x<45)t.x=WORLD_W-45;
    });
    updateTrainPositions();raf=requestAnimationFrame(frame);
  }
  function resetDemo() {running=false;demo=false;cancelAnimationFrame(raf);signalStates={};pointStates={};[700,5200,10200].forEach((x,i)=>trains[i].x=x);drawDiagram();updateDemoUI();activity('Demo reset. The diagram is back in schematic mode.');}
  function inspectAsset(kind,key,{focus=false}={}) {
    const def=(kind==='signal'?signalDefs:kind==='track'?trackDefs:pointDefs).find(d=>d.key===key);
    if(!def)return;
    selected=def.i;asset={kind,key};renderStationList();renderInspector();drawDiagram();persist();
    if(focus){camera.w=Math.min(camera.w,1050);camera.x=def.x-camera.w*.5;camera.h=camera.w*svg.clientHeight/Math.max(1,svg.clientWidth);camera.y=def.y-camera.h*.5;applyCamera();}
    if(diagramView||window.innerWidth<=1000)$('inspector').classList.add('open');
    activity(`${stations[selected].name} · ${kind[0].toUpperCase()+kind.slice(1)} ${key} selected.`);
  }
  function exportNotes() {
    const payload={app:'Line 3 Track Explorer',exportedAt:new Date().toISOString(),notes,savedStations:[...saved].map(i=>({code:stations[i].code,name:stations[i].name}))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='line3-project-notes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Project notes exported.');
  }
  let gesture=null, moved=false, clickTarget=null;const pointers=new Map();
  stage.addEventListener('pointerdown',e=>{
    const view=e.target.closest('.track-svg');if(!view)return;
    if(e.button&&e.pointerType==='mouse')return;
    if(gesture&&gesture.view!==view)return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1){gesture={x:e.clientX,y:e.clientY,cam:{...camera},target:e.target,view};moved=false;clickTarget=null;}
    else if(pointers.size===2){const p=[...pointers.values()],r=view.getBoundingClientRect();gesture={pinch:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),cx:Number(view.dataset.row)+((p[0].x+p[1].x)/2-r.left)/r.width,cy:((p[0].y+p[1].y)/2-r.top)/r.height,cam:{...camera},view};moved=true;}
    view.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId)||!gesture)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2&&gesture.pinch){const p=[...pointers.values()],distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);camera=layout.zoomCamera(gesture.cam,gesture.pinch/Math.max(10,distance),gesture.cx,gesture.cy,layoutRows);applyCamera();return;}
    if(pointers.size!==1||gesture.pinch)return;
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
    if(Math.abs(dx)+Math.abs(dy)>4){moved=true;gesture.view.classList.add('dragging');}
    if(moved){camera=layout.panCamera(gesture.cam,dx,dy,{width:gesture.view.clientWidth,height:gesture.view.clientHeight,rows:layoutRows});applyCamera();}
  });
  function endPointer(e) {
    if(!pointers.has(e.pointerId))return;
    pointers.delete(e.pointerId);views.forEach(view=>view.classList.remove('dragging'));
    if(!moved&&gesture?.target)clickTarget=gesture.target;
    if(pointers.size===0)gesture=null;else moved=true;
  }
  stage.addEventListener('pointerup',endPointer);stage.addEventListener('pointercancel',()=>{pointers.clear();gesture=null;views.forEach(view=>view.classList.remove('dragging'));});
  stage.addEventListener('click',e=>{
    const target=clickTarget||e.target;clickTarget=null;
    if(moved)return;
    const sig=target.closest('[data-signal]'),point=target.closest('[data-point]'),track=target.closest('[data-track]'),station=target.closest('[data-station]');
    if(sig)inspectAsset('signal',sig.dataset.signal);else if(point)inspectAsset('point',point.dataset.point);else if(track)inspectAsset('track',track.dataset.track);else if(station)selectStation(Number(station.dataset.station),{focus:false});
  });
  stage.addEventListener('wheel',e=>{const view=e.target.closest('.track-svg');if(!view)return;e.preventDefault();const r=view.getBoundingClientRect();zoom(Math.exp(Math.max(-200,Math.min(200,e.deltaY))*.0015),Number(view.dataset.row)+(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);},{passive:false});
  stage.addEventListener('dblclick',e=>{const view=e.target.closest('.track-svg');if(!view)return;const r=view.getBoundingClientRect();zoom(.65,Number(view.dataset.row)+(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);});
  function setDiagramView(value,{focus=true}={}) {
    diagramView=value;document.body.classList.toggle('diagram-view',value);
    $('diagramViewBtn').setAttribute('aria-pressed',value);
    $('diagramViewBtn').setAttribute('aria-label',value?'Open workspace':'Expand diagram');
    $('diagramViewBtn').title=value?'Open workspace':'Expand diagram';
    $('stationSidebar').classList.remove('open');$('inspector').classList.remove('open');
    persist();if(focus)requestAnimationFrame(()=>focusStation());
  }
  function syncFullScreen() {
    const active=!!(document.fullscreenElement||document.webkitFullscreenElement);
    $('fullScreenBtn').setAttribute('aria-pressed',active);
    $('fullScreenBtn').setAttribute('aria-label',active?'Exit full screen':'Full screen');
    $('fullScreenBtn').title=active?'Exit full screen':'Full screen';
  }
  async function toggleFullScreen() {
    try {
      if(document.fullscreenElement||document.webkitFullscreenElement){
        const exit=document.exitFullscreen||document.webkitExitFullscreen;
        if(exit)await exit.call(document);
      } else {
        setDiagramView(true);
        const enter=document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen;
        if(enter)await enter.call(document.documentElement);
        else toast('Expanded diagram is on. Device full screen is unavailable in this browser.');
      }
    } catch { toast('Expanded diagram is on. Device full screen is unavailable in this browser.'); }
    syncFullScreen();
  }
  $('fullScreenBtn').onclick=toggleFullScreen;
  $('diagramViewBtn').onclick=async()=>{
    if(diagramView&&(document.fullscreenElement||document.webkitFullscreenElement)){
      const exit=document.exitFullscreen||document.webkitExitFullscreen;if(exit)await exit.call(document);
    }
    setDiagramView(!diagramView);
  };
  $('stationsBtn').onclick=()=>$('stationSidebar').classList.toggle('open');
  $('closeStations').onclick=()=>$('stationSidebar').classList.remove('open');
  function screenChanged(){syncFullScreen();requestAnimationFrame(()=>focusStation());}
  document.addEventListener('fullscreenchange',screenChanged);document.addEventListener('webkitfullscreenchange',screenChanged);
  $('stationList').addEventListener('click',e=>{const b=e.target.closest('[data-nav-station]');if(b){selectStation(Number(b.dataset.navStation));const q=$('stationSearch').value.trim().toUpperCase();const match=assetIds(selected).find(id=>id===q||('POINT '+id)===q);if(match){const kind=pointIds(selected).includes(match)?'point':trackDefs.some(d=>d.id===match)?'track':'signal';inspectAsset(kind,match,{focus:true});}}});
  $('minimap').addEventListener('click',e=>{const b=e.target.closest('[data-map-station]');if(b)selectStation(Number(b.dataset.mapStation),{open:false});});
  $('stationSearch').addEventListener('input',renderStationList);
  $('allFilter').onclick=()=>{savedOnly=false;$('allFilter').classList.add('active');$('savedFilter').classList.remove('active');renderStationList();};
  $('savedFilter').onclick=()=>{savedOnly=true;$('savedFilter').classList.add('active');$('allFilter').classList.remove('active');renderStationList();};
  $('zoomIn').onclick=()=>zoom(.78);$('zoomOut').onclick=()=>zoom(1.28);$('fitBtn').onclick=fitView;$('focusBtn').onclick=()=>focusStation();
  document.querySelectorAll('[data-layout-rows]').forEach(button=>button.onclick=()=>setLayoutRows(button.dataset.layoutRows));
  $('labelsBtn').onclick=()=>{labels=!labels;views.forEach(view=>view.classList.toggle('labels-off',!labels));$('labelsBtn').classList.toggle('active',labels);$('labelsBtn').setAttribute('aria-pressed',labels);persist();};
  $('demoBtn').onclick=toggleDemo;$('resetDemo').onclick=resetDemo;
  $('themeBtn').onclick=()=>{document.body.classList.toggle('dark');persist();};
  $('helpBtn').onclick=()=>$('helpDialog').showModal();
  $('menuBtn').onclick=()=>$('stationSidebar').classList.toggle('open');$('closeInspector').onclick=()=>$('inspector').classList.remove('open');
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
  $('inspectorContent').addEventListener('click',e=>{
    const chip=e.target.closest('[data-inspect-id]');if(chip){inspectAsset(chip.dataset.inspectKind,chip.dataset.inspectId,{focus:true});return;}
    const state=e.target.closest('[data-asset-state]');
    if(state&&demo&&asset){const value=state.dataset.assetState;if(asset.kind==='signal')signalStates[asset.key]=value;else pointStates[asset.key]=value==='reverse';paintStates();renderInspector();activity(`Demo ${asset.kind} display changed to ${value}.`);}
    else if(e.target.closest('#saveStation')){if(saved.has(selected))saved.delete(selected);else saved.add(selected);persist();renderStationList();renderInspector();}
    else if(e.target.closest('#previousStation'))selectStation(selected-1);
    else if(e.target.closest('#nextStation'))selectStation(selected+1);
    else if(e.target.closest('#exportNotes'))exportNotes();
  });
  $('inspectorContent').addEventListener('input',e=>{if(e.target.id==='stationNote'){notes[stations[selected].code]=e.target.value;persist();}});
  document.addEventListener('keydown',e=>{
    if(e.target.matches('input,textarea')||document.querySelector('dialog[open]'))return;
    if(e.key==='/'){e.preventDefault();$('stationSidebar').classList.add('open');$('stationSearch').focus();}
    else if(e.key==='+'||e.key==='=')zoom(.8);else if(e.key==='-')zoom(1.25);
    else if(e.key.toLowerCase()==='f')fitView();
    else if(e.key==='ArrowRight'){e.preventDefault();selectStation(selected+1,{open:false});}
    else if(e.key==='ArrowLeft'){e.preventDefault();selectStation(selected-1,{open:false});}
    else if(e.key==='Escape'){$('stationSidebar').classList.remove('open');$('inspector').classList.remove('open');}
  });
  function updateClock(){ $('clock').textContent=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Riyadh',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date())+' AST'; }
  updateClock();setInterval(updateClock,1000);
  if(stored.dark)document.body.classList.add('dark');svg.classList.toggle('labels-off',!labels);$('labelsBtn').classList.toggle('active',labels);$('labelsBtn').setAttribute('aria-pressed',labels);
  setLayoutRows(layoutRows,{focus:false});setDiagramView(diagramView,{focus:false});syncFullScreen();
  renderStationList();renderInspector();drawDiagram();
  new ResizeObserver(()=>{if(stage.clientWidth&&stage.clientHeight)focusStation();}).observe(stage);
  requestAnimationFrame(()=>{focusStation();$('stationList').querySelector('.active')?.scrollIntoView({block:'nearest'});});
})();
