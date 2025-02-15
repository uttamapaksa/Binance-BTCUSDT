import { Chart as ChartJS, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartDataLabels);

export default function BarChart({ trades }) {
  const foregroundColor = getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim();
  const chartGreenColor = getComputedStyle(document.documentElement).getPropertyValue("--chart-green").trim();
  const chartRedColor = getComputedStyle(document.documentElement).getPropertyValue("--chart-red").trim();

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
        title: { display: true, text: '(1,000,000$)' },
        grid: { color: 'rgba(128, 128, 128, 0.2)' }
      },
      y: {
        min: 0,
        max: 100,
        beginAtZero: true,
        ticks: { stepSize: 20 },
        grid: { color: 'rgba(128, 128, 128, 0.2)' }
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
        color: foregroundColor,
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
        backgroundColor: chartRedColor,
      },
      {
        data: longRatio,
        backgroundColor: chartGreenColor,
      },
    ],
  };

  return <Bar options={options} data={data} />;
}
