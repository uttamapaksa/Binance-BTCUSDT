import { Chart as ChartJS, ArcElement, Title, Tooltip } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Title, Tooltip);

export default function DoughnutChart({ period, ratio }) {
  const options = {
    plugins: {
      title: {
        display: true,
        text: `${period}`,
        font: { weight: '400' },
        color: ratio > 50 ? '#07a336' : (ratio < 50 ? '#eb2f2f' : '#000000'),
      },
      tooltip: {
        callbacks: {
          label: function (tooltipItem) {
            return `${tooltipItem.formattedValue}%`;
          },
        },
      },
      datalabels: {
        display: false,
      },
    },
    animation: false,
  };
  
  const labels = [`Long`, `Short`];

  const data = {
    labels,
    datasets: [
      {
        data: [ratio, 100-ratio],
        backgroundColor: [
          '#07a336',
          '#eb2f2f',
        ],
        borderColor: [
          'white',
          'white',
        ],
        borderWidth: 2,
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
