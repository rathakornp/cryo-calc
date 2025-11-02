// tiny wrapper so the HTML does not need to know Chart.js
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
