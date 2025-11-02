// tiny wrapper so the HTML does not need to know Chart.js
export function plotLive(series){
  const ctx=document.getElementById('chart');
  if(window.tempChart) window.tempChart.destroy();
  window.tempChart=new Chart(ctx,{
    type:'line',
    data:{
      labels:series.time,
      datasets:[{
        label:'Pipe temp (°C)',
        data:series.temp,
        borderColor:'#005faf',
        fill:false,
        tension:0.2,
        pointRadius:0,
        segment:{borderWidth:2}
      }]
    },
    options:{
      responsive:true,
      animation:false,               // we drive updates ourselves
      plugins:{legend:{display:true}},
      scales:{
        x:{title:{display:true,text:'Time (h)'}},
        y:{title:{display:true,text:'Temperature (°C)'}}
      },
      onClick:(evt,activeElements)=>{
        if(!activeElements.length) return;
        const dataIndex=activeElements[0].index;
        jumpToIndex(dataIndex);
      }
    }
  });
}
function jumpToIndex(idx){
  if(!window.sim) return;
  window.sim.idx=idx;
  window.sim.time=window.sim.series.time[idx]*3600;
  window.sim.Tpipe=window.sim.series.temp[idx]+273.15;
  updateResults(window.sim);
  // redraw vertical indicator (optional)
  window.tempChart.setActiveElements([{datasetIndex:0,index:idx}]);
  window.tempChart.update('none');
}
export function plot(series){
  const ctx = document.getElementById('chart');
  if(window.tempChart) window.tempChart.destroy();
  window.tempChart = new Chart(ctx, {
    type:'line',
    data:{
      labels: series.time,
      datasets:[{
        label:'Pipe temp (°C)',
        data: series.temp,
        borderColor:'#005faf',
        fill:false,
        tension:0.2
      }]
    },
    options:{
      responsive:true,
      plugins:{legend:{display:true}},
      scales:{
        x:{title:{display:true, text:'Time (h)'}},
        y:{title:{display:true, text:'Temperature (°C)'}}
      }
    }
  });
}
