import { Chart as ChartJS, ArcElement, Title, Tooltip } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Title, Tooltip);

export default function DoughnutChart({ period, ratio }) {
  const backgroundColor = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
  const chartGreenColor = getComputedStyle(document.documentElement).getPropertyValue("--chart-green").trim();
  const chartRedColor = getComputedStyle(document.documentElement).getPropertyValue("--chart-red").trim();
  
  const options = {
    plugins: {
      title: {
        display: true,
        text: `${period}`,
        font: { weight: '600' },
        color: ratio > 50 ? chartGreenColor : (ratio < 50 ? chartRedColor : 'gray'),
      },
      tooltip: {
        callbacks: {
          label: function (tooltipItem) {
            return `${tooltipItem.formattedValue}%`;
          },
        },
      },
      datalabels: { display: false },
    },
    animation: false,
  };
  
  const labels = [`Long`, `Short`];
  const data = {
    labels,
    datasets: [
      {
        data: [ratio, 100-ratio],
        backgroundColor: [ chartGreenColor, chartRedColor ],
        borderColor: [ backgroundColor, backgroundColor ],
        borderWidth: 1.5,
      },
    ],
    responsive: true,
    enimation: false,
  };

  return (
    <div className='my-1 w-24 sm:w-28 md:w-32'>
      <Doughnut options={options} data={data} />
    </div>
  );
}
