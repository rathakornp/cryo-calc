import {plot} from './chart.js';

const RHO_STEEL = 8000;                 // kg/m³
const RHO_N2    = 1.250;                // kg/Nm³  (0 °C, 1 atm)
const CP_N2     = 1.04e3;               // J/kgK   (will be made T-dependent later)
const STEP      = 10;                   // seconds
const DEG_TO_K  = 273.15;

// AISI-304 polynomial J/kgK  (valid 60 – 300 K, ±2 %)
function CpSteel(TK){
  const t = TK/100;
  return 100*( 2.716 + 9.146*t - 14.08*t*t + 9.369*t*t*t - 1.916*t*t*t*t );
}

document.getElementById('run').onclick = ()=>{
  const errBox = document.getElementById('errors');
  errBox.textContent='';
  try{ runCalculation(); }
  catch(e){ errBox.textContent = e.message; }
};

function read(id){
  const v = parseFloat(document.getElementById(id).value);
  if(!isFinite(v)) throw new Error(`Invalid number in ${id}`);
  return v;
}

function runCalculation(){
  // ---- inputs ----
  const L       = read('L');
  const OD_mm   = read('OD');
  const t_mm    = read('t');
  const T0_C    = read('T0');
  const Tt_C    = read('Ttarget');
  const TN2_C   = read('TN2');
  const VN2_h   = read('VN2');
  const Tamb_C  = read('Tamb');
  const U       = read('U');
  const eta     = read('eta')/100;

  // ---- basic validation ----
  if(Tt_C >= T0_C) throw new Error('Target must be < Initial');
  if(TN2_C >= Tt_C) throw new Error('N₂ inlet must be < Target');
  if(eta<=0||eta>1)throw new Error('Efficiency must be 1-100 %');

  // ---- geometry ----
  const OD = OD_mm*1e-3, t = t_mm*1e-3, ID = OD - 2*t;
  if(ID<=0) throw new Error('Negative inner diameter');
  const A_steel = Math.PI/4*(OD*OD - ID*ID);
  const m_steel = A_steel * L * RHO_STEEL;
  const A_outer = Math.PI * OD * L;

  // ---- flows ----
  const mDotN2 = (VN2_h * RHO_N2) / 3600; // kg/s

  // ---- temps → K ----
  let Tpipe  = T0_C   + DEG_TO_K;
  const Tn2  = TN2_C  + DEG_TO_K;
  const Tamb = Tamb_C + DEG_TO_K;
  const TtargetK = Tt_C + DEG_TO_K;

  // ---- loop storage ----
  const series = {time:[], temp:[]};
  let time = 0, QsumRemoved=0, QsumIngress=0;

  // ---- main loop ----
  while(Tpipe > TtargetK + 0.1){          // 0.1 K guard
    const CpPipe = CpSteel(Tpipe);

    const Qcool = mDotN2 * CP_N2 * (Tpipe - Tn2) * eta;
    const Qingress = U * A_outer * (Tamb - Tpipe);
    const Qnet = Qcool - Qingress;

    if(Qnet <= 0) throw new Error('Stall: heat ingress ≥ cooling power – lower target or improve insulation/flow');

    const dE = Qnet * STEP;               // Joules removed in step
    const dT = dE / (m_steel * CpPipe);
    Tpipe -= dT;
    time += STEP;

    QsumRemoved += Qcool  * STEP;
    QsumIngress += Qingress * STEP;

    // store every 1 min for plotting
    if(series.time.length===0 || (time % 60 === 0)){
      series.time.push(time/3600);
      series.temp.push(Tpipe - DEG_TO_K);
    }
  }

  // ---- final totals ----
  const totalTime_h = time/3600;
  const totalN2_kg  = mDotN2 * time;
  const totalN2_Nm3 = totalN2_kg / RHO_N2;
  const netMJ       = (QsumRemoved - QsumIngress)/1e6;

  // ---- render ----
  const res = document.getElementById('results');
  res.innerHTML = `
    <h3>Results</h3>
    Total time: ${totalTime_h.toFixed(2)} h<br>
    Total N₂: ${totalN2_Nm3.toFixed(0)} Nm³  (${totalN2_kg.toFixed(0)} kg)<br>
    Gross refrigeration: ${(QsumRemoved/1e6).toFixed(1)} MJ<br>
    Heat ingress: ${(QsumIngress/1e6).toFixed(1)} MJ<br>
    Net heat removed: ${netMJ.toFixed(1)} MJ
  `;
  plot(series);
}
// ---------- global simulation state ----------
let sim = null;          // active simulation object
let animFrame = null;    // requestAnimationFrame handle

// ---------- DOM hooks ----------
const playBtn  = document.getElementById('playBtn');
const resetBtn = document.getElementById('resetBtn');
const speedSl  = document.getElementById('speed');
const speedLbl = document.getElementById('speedVal');
const stepSl   = document.getElementById('stepSize');

playBtn.onclick  = ()=> togglePlay();
resetBtn.onclick = ()=> resetSim();
speedSl.oninput  = ()=> speedLbl.textContent = (speedSl.value/50).toFixed(1)+'×';

// ---------- simulation class ----------
class CooldownSim{
  constructor(inputs){
    this.inputs = inputs;
    this.tStep  = parseInt(stepSl.value);
    this.time   = 0;                       // seconds
    this.Tpipe  = inputs.T0_K;
    this.series = {time:[0], temp:[inputs.T0_C]};
    this.QnetArr= [0];
    this.idx    = 0;                       // current playback index
    this.running= false;
    this._preCompute();
  }
  _preCompute(){
    const {L,OD_mm,t_mm} = this.inputs;
    const OD = OD_mm*1e-3, t = t_mm*1e-3, ID = OD - 2*t;
    this.mSteel = Math.PI/4*(OD*OD - ID*ID)*L*8000;
    this.Aouter = Math.PI*OD*L;
    this.mDotN2 = (this.inputs.VN2_h*1.250)/3600;
  }
  // advance physics by one tStep
  step(){
    if(this.Tpipe <= this.inputs.Ttarget_K) return false; // finished
    const TK = this.Tpipe;
    const Cp = CpSteel(TK);
    const Qcool = this.mDotN2 * 1040 * (TK - this.inputs.TN2_K) * this.inputs.eta;
    const Qingress = this.inputs.U * this.Aouter * (this.inputs.Tamb_K - TK);
    const Qnet = Qcool - Qingress;
    if(Qnet <=0) throw new Error('Stall detected');
    const dE = Qnet * this.tStep;
    const dT = dE / (this.mSteel * Cp);
    this.Tpipe -= dT;
    this.time  += this.tStep;
    this.series.time.push(this.time/3600);
    this.series.temp.push(this.Tpipe - 273.15);
    this.QnetArr.push(Qnet);
    return true;
  }
  // run until user pauses or target reached
  play(){
    if(this.running) return;
    this.running = true;
    const speed = speedSl.value/50;   // 0→4×
    const tick = ()=>{
      if(!this.running) return;
      for(let i=0;i<Math.max(1,Math.round(speed));i++) this.step();
      plotLive(this.series);
      updateResults(this);
      if(this.Tpipe <= this.inputs.Ttarget_K){ pause(); return;}
      animFrame = requestAnimationFrame(tick);
    };
    tick();
  }
  pause(){ this.running=false; cancelAnimationFrame(animFrame);}
  reset(){
    this.pause();
    this.time=0; this.Tpipe=this.inputs.T0_K;
    this.series={time:[0],temp:[this.inputs.T0_C]};
    this.QnetArr=[0];
    plotLive(this.series);
    updateResults(this);
  }
}

// ---------- control ----------
function togglePlay(){
  if(!sim) resetSim();
  sim.running ? sim.pause() : sim.play();
  playBtn.textContent = sim.running ? '❚❚ Pause' : '▶ Play';
}
function pause(){ if(sim){sim.pause(); playBtn.textContent='▶ Play';}}
function resetSim(){
  pause();
  const inputs = getInputs();          // reuse old validation
  sim = new CooldownSim(inputs);
  plotLive(sim.series);
  updateResults(sim);
}

// ---------- helpers ----------
function getInputs(){
  // reuse your old read() helpers, convert to K, etc.
  const T0_C=read('T0'), Tt_C=read('Ttarget'), TN2_C=read('TN2'), Tamb_C=read('Tamb');
  return {
    L:read('L'), OD_mm:read('OD'), t_mm:read('t'),
    T0_K:T0_C+273.15, Ttarget_K:Tt_C+273.15, TN2_K:TN2_C+273.15, Tamb_K:Tamb_C+273.15,
    VN2_h:read('VN2'), U:read('U'), eta:read('eta')/100
  };
}
function updateResults(sim){
  const res=document.getElementById('results');
  res.innerHTML=`
    <b>Live</b> – Time: ${(sim.time/3600).toFixed(2)} h |
    Temp: ${(sim.Tpipe-273.15).toFixed(1)} °C |
    Step: ${sim.tStep} s`;
}
