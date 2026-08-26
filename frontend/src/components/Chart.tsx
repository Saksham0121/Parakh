import { useEffect, useRef } from 'react';
import { init, dispose, Chart as KLineChart } from 'klinecharts';
import { useSocketStore } from '../store/socketStore';
import { api } from '../lib/api';

interface ChartProps {
  symbol: string;
}

export default function Chart({ symbol }: ChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<KLineChart | null>(null);
  
  // Get live prices from store
  const livePrice = useSocketStore(state => state.prices[symbol]);

  useEffect(() => {
    if (!chartRef.current || !symbol) return;

    // Initialize klinechart
    const chart = init(chartRef.current, {
      styles: {
        grid: {
          horizontal: { color: '#1C2333', style: 'solid', size: 1 },
          vertical: { color: '#1C2333', style: 'solid', size: 1 }
        },
        candle: {
          type: 'candle_solid',
          bar: {
            upColor: '#00E676',
            downColor: '#FF3B30',
            noChangeColor: '#7A8B9E',
            upBorderColor: '#00E676',
            downBorderColor: '#FF3B30',
            noChangeBorderColor: '#7A8B9E',
            upWickColor: '#00E676',
            downWickColor: '#FF3B30',
            noChangeWickColor: '#7A8B9E'
          }
        },
        yAxis: {
          axisLine: { color: '#1C2333', size: 1 },
          tickText: { color: '#7A8B9E', family: 'JetBrains Mono', size: 11 }
        },
        xAxis: {
          axisLine: { color: '#1C2333', size: 1 },
          tickText: { color: '#7A8B9E', family: 'JetBrains Mono', size: 11 }
        }
      }
    });
    
    chartInstance.current = chart;

    // Fetch historical data
    const fetchHistory = async () => {
      try {
        const now = Math.floor(Date.now() / 1000);
        const from = now - 30 * 24 * 60 * 60; // Last 30 days
        const data = await api.getCandles(symbol, 'D', from, now);
        
        if (data && data.t) {
          const kLineData = data.t.map((timestamp: number, i: number) => ({
            timestamp: timestamp * 1000,
            open: data.o[i],
            high: data.h[i],
            low: data.l[i],
            close: data.c[i],
            volume: data.v[i]
          }));
          
          chart?.applyNewData(kLineData);
        }
      } catch (err) {
        console.error('Failed to load historical data', err);
      }
    };

    fetchHistory();

    return () => {
      if (chartInstance.current) {
        dispose(chartRef.current!);
      }
    };
  }, [symbol]);

  // Update chart with live price
  useEffect(() => {
    if (chartInstance.current && livePrice) {
      chartInstance.current.updateData({
        timestamp: livePrice.timestamp * 1000,
        open: livePrice.price, // Simplify: mock candle with live price
        high: livePrice.price,
        low: livePrice.price,
        close: livePrice.price,
        volume: livePrice.volume || 0
      });
    }
  }, [livePrice]);

  return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
}
