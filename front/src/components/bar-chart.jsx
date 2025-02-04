import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, layouts } from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartDataLabels);

export default function BarChart({ trades }) {
  const shortData = [trades[0], trades[2], trades[4]];
  const longData = [trades[1], trades[3], trades[5]];
  const totalData = [0, 1, 2].map((i) => (shortData[i] + longData[i]) || 1);
  const shortRatio = [0, 1, 2].map((i) => shortData[i] / totalData[i] * 100 | 0);
  const longRatio = [0, 1, 2].map((i) => longData[i] / totalData[i] * 100 | 0);

  const options = {
    layout: {
      padding: {
        top: 20,
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: '(1,000,000$)'
        }
      },
      y: {
        min: 0,
        max: 100,
        beginAtZero: true,
        ticks: {
          stepSize: 20,
        },
      },
    },
    plugins: {
      tooltip: {
        callbacks: {
          label: function (tooltipItem) {
            const percentage = tooltipItem.raw;
            return `${percentage}%`;
          },
        },
      },
      datalabels: {
        anchor: 'end',  // 데이터 라벨 위치
        align: 'top',   // 막대 위에 표시
        color: 'black',
        font: { size: 12 },
        formatter: (_, context) => {
          const index = context.dataIndex;
          const datasetIndex = context.datasetIndex;
          if (datasetIndex === 0) {
            return `${shortData[index]}`;
          }
          return `${longData[index]}`;
        },
      },
    },
    maintainAspectRatio: false, // 기본값 true
    responsive: true,
    animation: false,
  };

  const labels = ['10K', '100K', '1000K'];

  const data = {
    labels,
    datasets: [
      {
        data: shortRatio,
        backgroundColor: '#eb2f2f',
      },
      {
        data: longRatio,
        backgroundColor: '#07a336',
      },
    ],
  };

  return <Bar options={options} data={data} />;
}
