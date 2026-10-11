"use strict";
// WTI Research Terminal — all indicators are calculated causally from dated settlement observations.
// No OHLC is fabricated and no historical dates are interpolated.
const $=(id)=>document.getElementById(id);
const COLORS={price:"#f0cf90",sma20:"#59aafa",sma50:"#bca1ff",ema20:"#4bd7ac",bb:"#668da8",rsi:"#62c2ec",macd:"#79c9b9",signal:"#e7b177"};
const PERIODS=[{n:5,label:"1주"},{n:21,label:"1개월"},{n:42,label:"2개월"},{n:63,label:"3개월"}];
const state={base:[],prices:[],ind:null,range:"63",studies:new Set(["sma20","rsi"]),horizon:5,backtest:5,lastBacktest:[],lastImported:0};
const format=(v,d=2)=>Number.isFinite(v)?v.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d}):"—";
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mean=(a)=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
function csvRows(csv){
  const s=String(csv||"").replace(/^\uFEFF/,"").trim(),lines=s.split(/\r?\n/),map=new Map();
  let invalid=0;
  for(const ln of lines){
    if(!ln.trim())continue;
    const cells=ln.trim().split(",").map(x=>x.trim().replace(/^"|"$/g,""));
    const date=cells[0],val=Number(cells[1]);
    if(/^\d{4}-\d{2}-\d{2}$/.test(date)&&date===new Date(date+"T00:00:00Z").toISOString().slice(0,10)&&cells[1]!==""&&Number.isFinite(val)&&val>0&&val<10000){
      map.set(date,{date,close:val});
    }else if(!/^(date|AssessDate)/i.test(date||""))invalid++;
  }
  const result=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
  if(!result.length)throw Error("유효한 date,settlement_usd_bbl 행이 없습니다.");
  return {rows:result,invalid};
}
function sma(prices,n){
  let sum=0;
  return prices.map((p,i)=>{sum+=p.close;if(i>=n)sum-=prices[i-n].close;return i>=n-1?sum/n:null});
}
function ema(values,n){
  const out=new Array(values.length).fill(null),alpha=2/(n+1);
  let seed=[],prev=null;
  for(let i=0;i<values.length;i++){
    const v=values[i];
    if(v==null){seed=[];prev=null;continue}
    if(prev==null){seed.push(v);if(seed.length===n){prev=mean(seed);out[i]=prev}}
    else {prev=v*alpha+prev*(1-alpha);out[i]=prev}
  }
  return out;
}
function makeIndicators(rows){
  const n=rows.length,close=rows.map(x=>x.close);
  const ma20=sma(rows,20),ma50=sma(rows,50),em20=ema(close,20);
  const bands=close.map((v,i)=>{
    if(i<19)return null;
    let variance=0;for(let j=i-19;j<=i;j++)variance+=(close[j]-ma20[i])**2;
    const sd=Math.sqrt(variance/20);return {upper:ma20[i]+2*sd,lower:ma20[i]-2*sd};
  });
  // RSI 14, Wilder smoothing after first fourteen changes.
  const rsi=new Array(n).fill(null);let avgGain=0,avgLoss=0;
  for(let i=1;i<n;i++){
    const delta=close[i]-close[i-1],gain=Math.max(0,delta),loss=Math.max(0,-delta);
    if(i<=14){avgGain+=gain;avgLoss+=loss;if(i===14){avgGain/=14;avgLoss/=14}}
    else{avgGain=(avgGain*13+gain)/14;avgLoss=(avgLoss*13+loss)/14}
    if(i>=14)rsi[i]=avgLoss===0?(avgGain===0?50:100):100-100/(1+avgGain/avgLoss);
  }
  const fast=ema(close,12),slow=ema(close,26);
  const macd=close.map((v,i)=>fast[i]!=null&&slow[i]!=null?fast[i]-slow[i]:null);
  // MACD signal EMA 9 is initialized at the first nine valid MACD values.
  const signal=new Array(n).fill(null);let sum=0,count=0,prev=null;
  for(let i=0;i<n;i++){if(macd[i]==null)continue;
    if(prev==null){sum+=macd[i];count++;if(count===9){prev=sum/9;signal[i]=prev}}
    else{prev=macd[i]*.2+prev*.8;signal[i]=prev}
  }
  const hist=close.map((v,i)=>signal[i]==null?null:macd[i]-signal[i]);
  const vol=new Array(n).fill(null);
  for(let i=20;i<n;i++){const r=[];for(let j=i-19;j<=i;j++)r.push(Math.log(close[j]/close[j-1]));const m=mean(r);vol[i]=Math.sqrt(r.reduce((z,x)=>z+(x-m)**2,0)/(r.length-1))*Math.sqrt(252)*100}
  return {ma20,ma50,ema20:em20,bands,rsi,macd,signal,hist,vol};
}
function weights(h){return h===5?[.32,.48,.20]:h===21?[.38,.42,.20]:[.48,.32,.20]}
function scoreAt(i,h){
  const p=state.prices[i]?.close,I=state.ind;
  if(i<60||i<h||I.ma20[i]==null||I.ma50[i]==null||I.rsi[i]==null||I.hist[i]==null)return null;
  const trend=clamp(50+((p-I.ma20[i])/p)*620+((I.ma20[i]-I.ma50[i])/p)*800,0,100);
  const roc=(p/state.prices[i-h].close-1);
  const momentum=clamp(50+(I.rsi[i]-50)*1.15+Math.tanh(I.hist[i]/(p*.018))*12+roc*240,0,100);
  const reversal=clamp(50-((p-I.ma20[i])/p)*700,0,100);
  const w=weights(h);
  const overall=clamp(Math.round(trend*w[0]+momentum*w[1]+reversal*w[2]),0,100);
  return {overall,trend:Math.round(trend),momentum:Math.round(momentum),reversal:Math.round(reversal),weights:w,roc};
}
function direction(score){return score>=56?"상승 우위":score<=44?"하락 우위":"중립"}
function directionClass(score){return score>=56?"up":score<=44?"down":"neutral"}
function renderCircularScore(signal,horizon){
  const ring=$("scoreRing"),number=$("scoreRingValue"),label=$("scoreRingHorizon"),directionText=$("scoreRingDirection"),caption=$("scoreRingCaption");
  if(!ring||!number||!label||!directionText||!caption)return;
  const score=signal?.overall;
  const horizonText=PERIODS.find(x=>x.n===horizon)?.label||"선택 기간";
  const color=score==null?"#59748c":score<=44?"#fb7c86":score<=55?"#d5b06b":"#43d3a4";
  const pct=score==null?0:clamp(score,0,100);
  ring.style.background="conic-gradient("+color+" 0 "+pct+"%, #1b3147 "+pct+"% 100%)";
  ring.setAttribute("aria-label",horizonText+" 방향 점수 "+(score??"미계산")+"/100, "+(score==null?"자료 부족":direction(score))+". 예측 확률이 아닙니다.");
  number.textContent=score==null?"—":score;
  label.textContent=horizonText+" 기술적 신호";
  directionText.textContent=score==null?"자료 부족":direction(score);
  directionText.className="ring-direction "+(score==null?"neutral":directionClass(score));
  caption.textContent="추세 · 모멘텀 · 평균회귀 · 규칙 기반 점수 (확률 아님)";
}
function refresh(){
  const rows=state.prices;
  if(!rows.length)return;
  state.ind=makeIndicators(rows);
  const n=rows.length,i=n-1,p=rows[i],previous=rows[n-2],change=previous?p.close-previous.close:0;
  $("latestDate").textContent=p.date;
  $("latestPrice").textContent="$"+format(p.close);
  const pct=previous?change/previous.close*100:0;
  $("latestDelta").className="hero-delta "+(change>0?"up":change<0?"down":"neutral");
  $("latestDelta").textContent=(change>0?"+":"")+format(change)+" USD / bbl  ("+(pct>0?"+":"")+format(pct)+"%)  · 전 관측일 대비";
  $("ma20").textContent="$"+format(state.ind.ma20[i]);$("ma20Note").textContent=p.close>=state.ind.ma20[i]?"종가가 20일 평균 위":"종가가 20일 평균 아래";
  $("rsiMetric").textContent=format(state.ind.rsi[i],1);
  $("rsiNote").textContent=state.ind.rsi[i]>=70?"과매수권":state.ind.rsi[i]<=30?"과매도권":"30~70 범위";
  $("volMetric").textContent=format(state.ind.vol[i],1)+"%";
  $("dataSummary").textContent=rows.length.toLocaleString()+"개 실제 정산가 · "+rows[0].date+" — "+p.date+" · 자료: 가격 DB 정산가 기록";
  $("dataStatus").textContent="현재 "+rows.length.toLocaleString()+"개 정산가 · "+p.date+" 기준 · 개인 파일 추가 "+state.lastImported+"개";
  drawChart();drawHorizonCards();drawBacktest();
}
const NS="http://www.w3.org/2000/svg";
function el(tag,attrs={},text){
  const node=document.createElementNS(NS,tag);
  for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));
  if(text!==undefined)node.textContent=text;
  return node;
}
function linePath(series,xOf,yOf){let d="",pen=false;for(let i=0;i<series.length;i++){const v=series[i];if(v==null||!Number.isFinite(v)){pen=false;continue}d+=(pen?"L":"M")+xOf(i).toFixed(2)+" "+yOf(v).toFixed(2)+" ";pen=true}return d.trim()}
function addPath(svg,values,xOf,yOf,color,width=2,dash=""){
  const d=linePath(values,xOf,yOf);if(!d)return;
  svg.appendChild(el("path",{d,fill:"none",stroke:color,"stroke-width":width,"stroke-linecap":"round","stroke-linejoin":"round",...(dash?{"stroke-dasharray":dash}:{})}));
}
function ticks(start,end,steps){return Array.from({length:steps+1},(_,i)=>start+(end-start)*i/steps)}
function drawChart(){
  const svg=$("priceChart");svg.replaceChildren();
  const data=state.prices,I=state.ind;
  if(!data.length)return;
  const count=state.range==="ALL"?data.length:Number(state.range);
  const start=Math.max(0,data.length-count),v=data.slice(start),N=v.length;
  const W=940,H=360,L=53,R=58,T=14,B=38,iw=W-L-R,ih=H-T-B;
  const curves=[{name:"settlement",color:COLORS.price,v:v.map(x=>x.close),width:2.9}];
  if(state.studies.has("sma20"))curves.push({color:COLORS.sma20,v:I.ma20.slice(start),width:1.7});
  if(state.studies.has("sma50"))curves.push({color:COLORS.sma50,v:I.ma50.slice(start),width:1.7});
  if(state.studies.has("ema20"))curves.push({color:COLORS.ema20,v:I.ema20.slice(start),width:1.7});
  if(state.studies.has("bb")){curves.push({color:COLORS.bb,v:I.bands.slice(start).map(x=>x?.upper??null),width:1.3,dash:"5 4"});curves.push({color:COLORS.bb,v:I.bands.slice(start).map(x=>x?.lower??null),width:1.3,dash:"5 4"})}
  const vals=curves.flatMap(c=>c.v).filter(Number.isFinite);
  const lo=Math.min(...vals),hi=Math.max(...vals),pad=Math.max((hi-lo)*.14,.75),yMin=lo-pad,yMax=hi+pad;
  const x=i=>L+(N===1?0:i/(N-1))*iw,y=num=>T+(yMax-num)/(yMax-yMin)*ih;
  for(const val of ticks(yMin,yMax,5)){const yy=y(val);svg.appendChild(el("line",{x1:L,y1:yy,x2:W-R,y2:yy,stroke:"#244158","stroke-width":"1","stroke-dasharray":"3 5"}));svg.appendChild(el("text",{x:W-R+8,y:yy+4,fill:"#9db4c9","font-size":12},format(val,1)))}
  svg.appendChild(el("text",{x:13,y:18,fill:"#9db4c9","font-size":10},"USD/bbl"));
  const tickCount=Math.min(5,Math.max(1,N-1));
  for(let j=0;j<=tickCount;j++){const k=Math.round(j/tickCount*(N-1));svg.appendChild(el("text",{x:x(k),y:H-11,fill:"#91a6bc","text-anchor":"middle","font-size":11},v[k].date.slice(5)))}
  curves.forEach(c=>addPath(svg,c.v,x,y,c.color,c.width,c.dash||""));
  const endVal=v[N-1].close,yy=y(endVal);
  svg.appendChild(el("circle",{cx:x(N-1),cy:yy,r:4.5,fill:COLORS.price,stroke:"#10253a","stroke-width":2}));
  svg.appendChild(el("rect",{x:W-R+5,y:clamp(yy-12,12,H-27),width:52,height:24,rx:5,fill:"#d4b572"}));
  svg.appendChild(el("text",{x:W-R+31,y:clamp(yy+4,28,H-12),"text-anchor":"middle",fill:"#16293a","font-weight":750,"font-size":12},format(endVal,2)));
  const hover=el("g");const cross=el("line",{x1:0,x2:0,y1:T,y2:H-B,stroke:"#8ac5ec","stroke-width":1.1,"stroke-dasharray":"4 4",opacity:0});const dot=el("circle",{cx:0,cy:0,r:5,fill:COLORS.price,stroke:"#07172b","stroke-width":2,opacity:0});hover.append(cross,dot);svg.appendChild(hover);
  const layer=el("rect",{x:L,y:T,width:iw,height:ih,fill:"transparent",style:"cursor:crosshair"});svg.appendChild(layer);
  const tooltip=$("chartTooltip");
  layer.addEventListener("pointermove",e=>{
    const rect=svg.getBoundingClientRect();
    const localX=(e.clientX-rect.left)/rect.width*W;
    const k=clamp(Math.round((localX-L)/iw*(N-1)),0,N-1),xx=x(k),cy=y(v[k].close);
    cross.setAttribute("x1",xx);cross.setAttribute("x2",xx);cross.setAttribute("opacity","1");
    dot.setAttribute("cx",xx);dot.setAttribute("cy",cy);dot.setAttribute("opacity","1");
    tooltip.hidden=false;tooltip.innerHTML=v[k].date+"<br><strong>$"+format(v[k].close)+"</strong> / bbl";
    const pctX=xx/W*100;tooltip.style.left=(pctX>75?pctX-21:pctX+2)+"%";
    tooltip.style.top=Math.max(8,cy/H*100-19)+"%";
  });
  layer.addEventListener("pointerleave",()=>{cross.setAttribute("opacity","0");dot.setAttribute("opacity","0");tooltip.hidden=true});
  $("rangeSummary").textContent=v[0].date+" — "+v[N-1].date+" · "+N.toLocaleString()+"개 정산가";
  drawOscillators(start);
}
function oscSvg(series1,series2,opts={}){
  const W=940,H=108,L=53,R=58,T=18,B=18,iw=W-L-R,ih=H-T-B,N=series1.length;
  const s=el("svg",{viewBox:"0 0 940 108",role:"img","aria-label":opts.label});
  const xs=i=>L+(N===1?0:i/(N-1))*iw;
  const values=[...series1,...(series2||[])].filter(Number.isFinite);
  let min=opts.rsi?0:Math.min(0,...values),max=opts.rsi?100:Math.max(0,...values);
  if(!opts.rsi){const pad=Math.max((max-min)*.12,.03);min-=pad;max+=pad}
  const ys=z=>T+(max-z)/(max-min)*ih;
  const guides=opts.rsi?[30,50,70]:[0];
  for(const v of guides){s.appendChild(el("line",{x1:L,y1:ys(v),x2:W-R,y2:ys(v),stroke:"#28435c","stroke-dasharray":"3 5"}));s.appendChild(el("text",{x:W-R+6,y:ys(v)+3,fill:"#8fa8bc","font-size":11},String(v)))}
  addPath(s,series1,xs,ys,opts.color||COLORS.rsi,2);
  if(series2)addPath(s,series2,xs,ys,COLORS.signal,1.6);
  s.appendChild(el("text",{x:13,y:15,fill:"#b8cee1","font-size":12},opts.label));
  return s;
}
function drawOscillators(start){
  const target=$("oscPanels");target.replaceChildren();
  const I=state.ind;
  if(state.studies.has("rsi")){
    const d=document.createElement("div");d.className="osc-section";d.appendChild(oscSvg(I.rsi.slice(start),null,{rsi:true,label:"RSI 14",color:COLORS.rsi}));target.appendChild(d);
  }
  if(state.studies.has("macd")){
    const d=document.createElement("div");d.className="osc-section";d.appendChild(oscSvg(I.macd.slice(start),I.signal.slice(start),{label:"MACD (12,26,9)",color:COLORS.macd}));target.appendChild(d);
  }
}
function drawHorizonCards(){
  const panel=$("horizonCards");panel.replaceChildren();
  const i=state.prices.length-1;
  for(const h of PERIODS){
    const s=scoreAt(i,h.n);
    const btn=document.createElement("button");btn.className="horizon-card "+(state.horizon===h.n?"active":"");btn.type="button";btn.setAttribute("aria-pressed",String(state.horizon===h.n));
    btn.innerHTML='<span class="label">'+h.label+'</span><strong class="'+(s?directionClass(s.overall):'neutral')+'">'+(s?s.overall:"—")+' <span style="font-size:11px;color:#98acc1">/100</span></strong><span class="dir '+(s?directionClass(s.overall):'neutral')+'">'+(s?direction(s.overall):"자료 부족")+'</span><div class="mini-rail"><span style="width:'+(s?s.overall:50)+'%"></span></div>';
    btn.addEventListener("click",()=>{state.horizon=h.n;drawHorizonCards()});panel.appendChild(btn);
  }
  const h=state.horizon,s=scoreAt(i,h);
  renderCircularScore(s,h);
  const p=$("scoreDetail");
  if(!s){p.textContent="분석에 필요한 정산가가 부족합니다.";return}
  const label=PERIODS.find(x=>x.n===h).label;
  const factors=[["추세",s.trend,s.weights[0]],["모멘텀",s.momentum,s.weights[1]],["평균회귀",s.reversal,s.weights[2]]];
  const trendPosition=state.prices[i].close>=state.ind.ma20[i]?"위":"아래";
  const note='종가는 20회 평균 $'+format(state.ind.ma20[i])+' '+trendPosition+'에 있습니다. RSI 14는 '+format(state.ind.rsi[i],1)+', MACD 히스토그램은 '+format(state.ind.hist[i],2)+'입니다. '+(s.overall>=56?"상승 신호가 우세하지만 반대 방향 급변 가능성이 있습니다.":s.overall<=44?"하락 신호가 우세하지만 기술적 반등 가능성이 있습니다.":"상승·하락 신호가 엇갈려 방향 확신이 약합니다.")+' 점수는 확률이 아니라 규칙 기반 비교 지표입니다.';
  p.innerHTML='<div class="score-main"><div class="score-title">'+label+' 판정 점수 <span>'+direction(s.overall)+'</span></div><div class="score-large '+directionClass(s.overall)+'">'+s.overall+'<small> / 100</small></div><div class="score-gauge"><b style="left:calc('+s.overall+'% - 2px)"></b></div>'+factors.map(f=>'<div class="factor-row"><div class="factor-name"><span>'+f[0]+' · 비중 '+Math.round(f[2]*100)+'%</span><b>'+f[1]+' /100</b></div><div class="factor-track"><i style="width:'+f[1]+'%"></i></div></div>').join('')+'<div class="score-explain"><strong>ANALYST NOTE</strong><br>'+note+'</div><p class="score-sources">추세: SMA20·SMA50 / 모멘텀: RSI·MACD·최근 '+h+'회 변화율 / 평균회귀: SMA20 괴리</p></div>';
}
function wilson(hits,n){
  if(!n)return "—";const z=1.96,p=hits/n,den=1+z*z/n,center=(p+z*z/(2*n))/den,margin=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
  return format((center-margin)*100,0)+"–"+format((center+margin)*100,0)+"%";
}
function backtestCalc(h){
  const n=state.prices.length,all=[];
  // disjoint forward evaluation intervals, anchored to most recent fully observable outcome.
  for(let t=n-1-h;t>=60+h;t-=h){
    const s=scoreAt(t,h);if(!s)continue;
    const actual=(state.prices[t+h].close/state.prices[t].close-1)*100;
    const signal=s.overall>=56?"UP":s.overall<=44?"DOWN":"NEUTRAL";
    const correct=signal==="UP"?actual>.5:signal==="DOWN"?actual<-.5:false;
    all.push({date:state.prices[t].date,score:s.overall,signal,evalDate:state.prices[t+h].date,actual,correct});
  }
  const directed=all.filter(x=>x.signal!=="NEUTRAL"),hits=directed.filter(x=>x.correct).length,baseline=directed.filter(x=>x.actual>.5).length;
  return {all,directed,hits,baseline};
}
function drawBacktest(){
  const h=state.backtest,bt=backtestCalc(h);state.lastBacktest=bt.all;
  const n=bt.directed.length,total=bt.all.length;
  $("btAccuracy").textContent=n?format(bt.hits/n*100,1)+"%":"—";
  $("btAccuracyInfo").textContent=bt.hits+" / "+n+"건 · 방향 판정";
  $("btCoverage").textContent=total?format(n/total*100,1)+"%":"—";
  $("btBaseline").textContent=n?format(bt.baseline/n*100,1)+"%":"—";
  $("btInterval").textContent=wilson(bt.hits,n);
  const tbody=$("backtestRows");tbody.replaceChildren();
  const latest=scoreAt(state.prices.length-1,h);
  if(latest){const row=document.createElement("tr");row.innerHTML='<td>'+state.prices.at(-1).date+'</td><td>'+latest.overall+'</td><td class="'+directionClass(latest.overall)+'">'+direction(latest.overall)+'</td><td>—</td><td>—</td><td>검증 대기</td>';tbody.appendChild(row)}
  for(const entry of bt.all.slice(0,9)){
    const tr=document.createElement("tr"),pred=entry.signal==="UP"?"상승 우위":entry.signal==="DOWN"?"하락 우위":"중립";
    const hit=entry.signal==="NEUTRAL"?"중립 제외":entry.correct?"적중":"미적중";
    tr.innerHTML='<td>'+entry.date+'</td><td>'+entry.score+'</td><td class="'+directionClass(entry.score)+'">'+pred+'</td><td>'+entry.evalDate+'</td><td class="'+(entry.actual>=0?"up":"down")+'">'+(entry.actual>0?"+":"")+format(entry.actual,2)+'%</td><td class="'+(entry.signal==="NEUTRAL"?"muted":entry.correct?"outcome-yes":"outcome-no")+'">'+hit+'</td>';
    tbody.appendChild(tr);
  }
}
function download(name,content,type="text/csv;charset=utf-8"){
  const blob=new Blob(["\uFEFF",content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function binding(){
  $("rangeControls").addEventListener("click",e=>{const btn=e.target.closest("button[data-range]");if(!btn)return;state.range=btn.dataset.range;document.querySelectorAll("#rangeControls button").forEach(x=>x.classList.toggle("selected",x===btn));if(state.ind)drawChart()});
  $("studyControls").addEventListener("click",e=>{const btn=e.target.closest("button[data-study]");if(!btn)return;const id=btn.dataset.study;if(state.studies.has(id))state.studies.delete(id);else state.studies.add(id);btn.classList.toggle("selected",state.studies.has(id));if(state.ind)drawChart()});
  $("btControls").addEventListener("click",e=>{const btn=e.target.closest("button[data-bt]");if(!btn)return;state.backtest=+btn.dataset.bt;document.querySelectorAll("#btControls button").forEach(x=>x.classList.toggle("selected",x===btn));if(state.ind)drawBacktest()});
  $("openData").onclick=()=>$("dataDialog").showModal();
  $("closeData").onclick=()=>$("dataDialog").close();
  $("printBtn").onclick=()=>window.print();
  $("downloadPrices").onclick=()=>download("wti-settlement-"+state.prices.at(-1).date+".csv","date,settlement_usd_bbl\n"+state.prices.map(x=>x.date+","+format(x.close)).join("\n")+"\n");
  $("downloadBacktest").onclick=()=>download("wti-backtest-"+state.backtest+"-sessions.csv","signal_date,score,prediction,evaluation_date,actual_return_pct,hit\n"+state.lastBacktest.map(x=>[x.date,x.score,x.signal,x.evalDate,format(x.actual),x.correct].join(",")).join("\n")+"\n");
  $("csvFile").addEventListener("change",async e=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      const parsed=csvRows(await file.text()),merged=new Map(state.base.map(x=>[x.date,x]));
      for(const x of parsed.rows)merged.set(x.date,x);
      state.prices=[...merged.values()].sort((a,b)=>a.date.localeCompare(b.date));
      state.lastImported=parsed.rows.length;refresh();
      $("dataStatus").textContent="불러오기 성공: "+parsed.rows.length+"건 적용 / 잘못된 행 "+parsed.invalid+"건. 새로고침하면 저장소 데이터로 복원됩니다.";
      $("dataDialog").close();
    }catch(err){$("dataStatus").textContent="CSV 오류: "+err.message}
    e.target.value="";
  });
  $("resetPrices").onclick=()=>{state.prices=state.base.map(x=>({...x}));state.lastImported=0;refresh();$("dataDialog").close()};
}
async function main(){
  binding();
  try{
    const response=await fetch("./data/wti-settlement.csv",{cache:"no-cache"});
    if(!response.ok)throw Error("HTTP "+response.status+" · 가격 CSV 로딩 실패");
    const parsed=csvRows(await response.text());state.base=parsed.rows;state.prices=parsed.rows.map(x=>({...x}));
    if(state.prices.length<65)throw Error("기술지표 계산에는 65거래일 이상 필요합니다");
    refresh();
    window.__WTI_TEST__={getSummary:()=>({count:state.prices.length,last:state.prices.at(-1),score:scoreAt(state.prices.length-1,5),backtest:backtestCalc(5).directed.length}),setRange:n=>{state.range=String(n);drawChart()}};
  }catch(err){
    $("latestDelta").textContent="데이터 오류: "+err.message;
    $("dataSummary").textContent="data/wti-settlement.csv 파일을 확인하세요";
    $("priceChart").replaceChildren(el("text",{x:40,y:45,fill:"#fb7c86"},err.message));
    $("dataStatus").textContent=err.message;
  }
}
document.addEventListener("DOMContentLoaded",main);
