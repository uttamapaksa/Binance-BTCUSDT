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
        color: ratio > 50 ? '#47b647' : (ratio < 50 ? '#f54960' : '#000000'),
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
          '#47b647',
          '#f54960',
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
