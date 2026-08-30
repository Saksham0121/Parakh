import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Activity,
  Layers,
  Sliders,
  TrendingUp,
  ShieldAlert,
  Target,
  Calendar,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';

interface BarData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  indicators?: Record<string, any>;
}

interface TradeData {
  id: string;
  entryIndex?: number;
  entryDate: string;
  entryPrice: number;
  exitIndex?: number;
  exitDate: string;
  exitPrice: number;
  exitReason: string;
  returnPct: number;
  result: 'win' | 'loss';
}

interface EquityPoint {
  time: number;
  value: number;
}

interface BacktestResultData {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgReturnPct: number;
  maxDrawdownPct: number;
  bestTradePct: number;
  worstTradePct: number;
}

interface PlaybackData {
  runId: string;
  symbol: string;
  setupName: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  bars: BarData[];
  trades: TradeData[];
  equityCurve: EquityPoint[];
  result: BacktestResultData;
}

export default function BacktestDashboard({ activeSymbol }: { activeSymbol: string }) {
  const [setups, setSetups] = useState<any[]>([]);
  const [selectedSetup, setSelectedSetup] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'running' | 'completed' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [playbackData, setPlaybackData] = useState<PlaybackData | null>(null);

  // Playback Animation State
  const [currentBarIndex, setCurrentBarIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(5);
  const [selectedTrade, setSelectedTrade] = useState<TradeData | null>(null);

  // Mouse Hover / Crosshair State
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Canvas Refs & Container Width tracking
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const equityCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [canvasWidth, setCanvasWidth] = useState(900);

  // Observe Container Resize for 100% responsive canvas rendering
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setCanvasWidth(Math.floor(entry.contentRect.width));
        }
      }
    });
    observer.observe(chartContainerRef.current);
    return () => observer.disconnect();
  }, [playbackData]);

  // Initialize Default Dates & Setups
  useEffect(() => {
    api.getSetups()
      .then((data) => {
        setSetups(data);
        if (data.length > 0) setSelectedSetup(data[0].id);
      })
      .catch(console.error);

    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  }, []);

  // Quick Date Preset Handlers
  const handleSetPresetRange = (months: number) => {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - months);
    setEndDate(end.toISOString().split('T')[0]);
    setStartDate(start.toISOString().split('T')[0]);
  };

  // Poll for Backtest Completion
  const pollStatus = useCallback((id: string) => {
    const interval = window.setInterval(async () => {
      try {
        const res = await api.getBacktestStatus(id);
        setStatus(res.status);
        setProgress(res.progress || 0);

        if (res.status === 'completed') {
          window.clearInterval(interval);
          const fullPlayback = await api.getBacktestPlayback(id);
          setPlaybackData(fullPlayback);
          if (fullPlayback.bars && fullPlayback.bars.length > 0) {
            const firstTradeBar = fullPlayback.trades?.[0]?.entryIndex ?? 0;
            const startIdx = Math.max(0, Math.min(firstTradeBar > 0 ? firstTradeBar - 5 : 20, fullPlayback.bars.length - 1));
            setCurrentBarIndex(startIdx);
            setIsPlaying(true);
          }
        } else if (res.status === 'failed') {
          window.clearInterval(interval);
        }
      } catch (err) {
        console.error('Error polling backtest status', err);
        window.clearInterval(interval);
        setStatus('failed');
      }
    }, 1200);
  }, []);

  // Trigger Backtest Run
  const handleRun = async () => {
    if (!selectedSetup) return;
    try {
      setStatus('running');
      setProgress(10);
      setPlaybackData(null);
      setIsPlaying(false);

      const response = await api.runBacktest({
        setupId: selectedSetup,
        symbol: activeSymbol,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
      });

      pollStatus(response.runId);
    } catch (error) {
      console.error('Failed to trigger backtest', error);
      setStatus('failed');
    }
  };

  // ─── Playback Engine (Interval Driver) ───────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || !playbackData || !playbackData.bars || playbackData.bars.length === 0) {
      if (animationTimerRef.current) clearInterval(animationTimerRef.current);
      return;
    }

    const intervalMs = Math.max(16, Math.floor(1000 / playbackSpeed));

    animationTimerRef.current = setInterval(() => {
      setCurrentBarIndex((prev) => {
        if (prev >= playbackData.bars.length - 1) {
          setIsPlaying(false);
          return playbackData.bars.length - 1;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => {
      if (animationTimerRef.current) clearInterval(animationTimerRef.current);
    };
  }, [isPlaying, playbackSpeed, playbackData]);

  // Jump to Next Trade
  const handleJumpToNextTrade = () => {
    if (!playbackData || !playbackData.trades || playbackData.trades.length === 0) return;
    const nextTrade = playbackData.trades.find((t) => {
      const idx = t.entryIndex ?? 0;
      return idx > currentBarIndex;
    });

    if (nextTrade && nextTrade.entryIndex !== undefined) {
      setCurrentBarIndex(Math.max(0, nextTrade.entryIndex - 2));
      setSelectedTrade(nextTrade);
    } else {
      const first = playbackData.trades[0];
      if (first.entryIndex !== undefined) {
        setCurrentBarIndex(Math.max(0, first.entryIndex - 2));
        setSelectedTrade(first);
      }
    }
  };

  // Jump to specific trade
  const handleSelectTrade = (trade: TradeData) => {
    setSelectedTrade(trade);
    if (trade.entryIndex !== undefined) {
      setCurrentBarIndex(Math.max(0, trade.entryIndex - 2));
      setIsPlaying(true);
    }
  };

  // ─── Candlestick Chart Renderer with Dedicated Right Price Gutter & Bottom Time Scale ───
  useEffect(() => {
    const canvas = chartCanvasRef.current;
    if (!canvas || !playbackData || !playbackData.bars || playbackData.bars.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const containerWidth = canvasWidth || canvas.parentElement?.clientWidth || 900;
    const height = 400;

    canvas.width = containerWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Layout Dimensions
    const priceGutterWidth = 75;
    const timeAxisHeight = 28;
    const chartWidth = containerWidth - priceGutterWidth;
    const chartHeight = height - timeAxisHeight - 20;
    const chartTop = 20;
    const chartBottom = chartTop + chartHeight;

    // Clear background
    ctx.fillStyle = '#06090E';
    ctx.fillRect(0, 0, containerWidth, height);

    // Slice visible window of bars
    const totalBars = playbackData.bars;
    const maxVisibleBars = Math.min(100, Math.max(30, Math.floor(chartWidth / 9)));
    const endIndex = Math.min(currentBarIndex, totalBars.length - 1);
    const startIndex = Math.max(0, endIndex - maxVisibleBars + 1);
    const visibleBars = totalBars.slice(startIndex, endIndex + 1);

    if (visibleBars.length === 0) return;

    // Price scaling
    let minPrice = Math.min(...visibleBars.map((b) => b.low));
    let maxPrice = Math.max(...visibleBars.map((b) => b.high));
    const pricePadding = (maxPrice - minPrice) * 0.12 || 1;
    minPrice = Math.max(0.01, minPrice - pricePadding);
    maxPrice = maxPrice + pricePadding;
    const priceRange = maxPrice - minPrice;

    const getY = (price: number) => chartBottom - ((price - minPrice) / priceRange) * chartHeight;
    const barWidth = Math.max(4, chartWidth / maxVisibleBars);
    const candleWidth = Math.max(2.5, barWidth * 0.7);

    // Volume scaling (bottom 18% of chart)
    const maxVol = Math.max(...visibleBars.map((b) => b.volume), 1);
    const volHeightMax = chartHeight * 0.18;

    // ─── 1. Draw Grid Lines ───────────────────────────────────────────────────
    ctx.strokeStyle = '#121824';
    ctx.lineWidth = 1;

    // Horizontal Price Grid Lines
    const numPriceSteps = 5;
    for (let p = 0; p <= numPriceSteps; p++) {
      const priceVal = minPrice + (priceRange / numPriceSteps) * p;
      const y = getY(priceVal);

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();

      // Price labels in dedicated right gutter
      ctx.fillStyle = '#5A6A85';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(priceVal.toFixed(2), chartWidth + 10, y + 3.5);
    }

    // Vertical Gutter Separator Line
    ctx.strokeStyle = '#1A2333';
    ctx.beginPath();
    ctx.moveTo(chartWidth, 0);
    ctx.lineTo(chartWidth, height);
    ctx.stroke();

    // Horizontal Bottom Time Separator Line
    ctx.beginPath();
    ctx.moveTo(0, chartBottom);
    ctx.lineTo(containerWidth, chartBottom);
    ctx.stroke();

    // ─── 2. Draw Volume Histogram ─────────────────────────────────────────────
    visibleBars.forEach((bar, idx) => {
      const x = idx * barWidth + (barWidth - candleWidth) / 2;
      const vHeight = (bar.volume / maxVol) * volHeightMax;
      const vY = chartBottom - vHeight;
      const isBullish = bar.close >= bar.open;

      ctx.fillStyle = isBullish ? 'rgba(8, 153, 129, 0.2)' : 'rgba(242, 54, 69, 0.2)';
      ctx.fillRect(x, vY, candleWidth, vHeight);
    });

    // ─── 3. Draw Indicators (SMA14 & EMA20) ──────────────────────────────────
    // SMA14 Line
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#2962FF';
    ctx.beginPath();
    let smaStarted = false;
    visibleBars.forEach((bar, idx) => {
      const val = bar.indicators?.SMA14;
      if (val != null) {
        const x = idx * barWidth + barWidth / 2;
        const y = getY(val);
        if (!smaStarted) {
          ctx.moveTo(x, y);
          smaStarted = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    if (smaStarted) ctx.stroke();

    // EMA20 Line
    ctx.strokeStyle = '#A855F7';
    ctx.beginPath();
    let emaStarted = false;
    visibleBars.forEach((bar, idx) => {
      const val = bar.indicators?.EMA20;
      if (val != null) {
        const x = idx * barWidth + barWidth / 2;
        const y = getY(val);
        if (!emaStarted) {
          ctx.moveTo(x, y);
          emaStarted = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    });
    if (emaStarted) ctx.stroke();

    // ─── 4. Draw Candlesticks ─────────────────────────────────────────────────
    visibleBars.forEach((bar, idx) => {
      const x = idx * barWidth + (barWidth - candleWidth) / 2;
      const centerX = x + candleWidth / 2;
      const openY = getY(bar.open);
      const closeY = getY(bar.close);
      const highY = getY(bar.high);
      const lowY = getY(bar.low);

      const isBullish = bar.close >= bar.open;
      const color = isBullish ? '#089981' : '#F23645';

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.2;

      // Wick
      ctx.beginPath();
      ctx.moveTo(centerX, highY);
      ctx.lineTo(centerX, lowY);
      ctx.stroke();

      // Candle Body
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(2, Math.abs(closeY - openY));
      ctx.fillRect(x, bodyTop, candleWidth, bodyHeight);
    });

    // ─── 5. Draw Trade Markers with High-Contrast Badges ──────────────────────
    if (playbackData.trades && playbackData.trades.length > 0) {
      playbackData.trades.forEach((trade) => {
        const entryBarIdx = trade.entryIndex ?? totalBars.findIndex((b) => new Date(b.time).getTime() >= new Date(trade.entryDate).getTime());
        const exitBarIdx = trade.exitIndex ?? totalBars.findIndex((b) => new Date(b.time).getTime() >= new Date(trade.exitDate).getTime());

        // Draw Entry Badge if inside visible window
        if (entryBarIdx >= startIndex && entryBarIdx <= endIndex) {
          const visibleIdx = entryBarIdx - startIndex;
          const entryX = visibleIdx * barWidth + barWidth / 2;
          const entryY = getY(trade.entryPrice);

          // Small upward pointer
          ctx.fillStyle = '#089981';
          ctx.beginPath();
          ctx.moveTo(entryX, entryY + 4);
          ctx.lineTo(entryX - 4, entryY + 12);
          ctx.lineTo(entryX + 4, entryY + 12);
          ctx.closePath();
          ctx.fill();

          // High contrast pill badge
          const label = `BUY $${trade.entryPrice.toFixed(1)}`;
          ctx.font = '700 9px JetBrains Mono, monospace';
          const textW = ctx.measureText(label).width;
          const badgeW = textW + 10;
          const badgeH = 16;
          const badgeX = entryX - badgeW / 2;
          const badgeY = entryY + 14;

          ctx.fillStyle = 'rgba(8, 153, 129, 0.95)';
          ctx.beginPath();
          ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
          ctx.fill();

          ctx.fillStyle = '#FFFFFF';
          ctx.textAlign = 'center';
          ctx.fillText(label, entryX, badgeY + 11.5);
        }

        // Draw Exit Badge if completed in current playback
        if (exitBarIdx !== -1 && exitBarIdx <= endIndex) {
          if (exitBarIdx >= startIndex && exitBarIdx <= endIndex) {
            const visibleExitIdx = exitBarIdx - startIndex;
            const exitX = visibleExitIdx * barWidth + barWidth / 2;
            const exitY = getY(trade.exitPrice);
            const isWin = trade.result === 'win';
            const badgeColor = isWin ? 'rgba(8, 153, 129, 0.95)' : 'rgba(242, 54, 69, 0.95)';

            // Small downward pointer
            ctx.fillStyle = isWin ? '#089981' : '#F23645';
            ctx.beginPath();
            ctx.moveTo(exitX, exitY - 4);
            ctx.lineTo(exitX - 4, exitY - 12);
            ctx.lineTo(exitX + 4, exitY - 12);
            ctx.closePath();
            ctx.fill();

            // High contrast pill badge
            const label = `${isWin ? '+' : ''}${trade.returnPct}%`;
            ctx.font = '700 9px JetBrains Mono, monospace';
            const textW = ctx.measureText(label).width;
            const badgeW = textW + 10;
            const badgeH = 16;
            const badgeX = exitX - badgeW / 2;
            const badgeY = exitY - 30;

            ctx.fillStyle = badgeColor;
            ctx.beginPath();
            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
            ctx.fill();

            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.fillText(label, exitX, badgeY + 11.5);
          }

          // Connecting Trade Path Line
          if (entryBarIdx >= startIndex && exitBarIdx >= startIndex) {
            const vEntryX = (entryBarIdx - startIndex) * barWidth + barWidth / 2;
            const vEntryY = getY(trade.entryPrice);
            const vExitX = (exitBarIdx - startIndex) * barWidth + barWidth / 2;
            const vExitY = getY(trade.exitPrice);

            ctx.save();
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = trade.result === 'win' ? 'rgba(8, 153, 129, 0.5)' : 'rgba(242, 54, 69, 0.5)';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(vEntryX, vEntryY);
            ctx.lineTo(vExitX, vExitY);
            ctx.stroke();
            ctx.restore();
          }
        }
      });
    }

    // ─── 6. Time Axis Date Ticks ──────────────────────────────────────────────
    const stepInterval = Math.max(1, Math.floor(visibleBars.length / 6));
    ctx.fillStyle = '#5A6A85';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';

    for (let i = 0; i < visibleBars.length; i += stepInterval) {
      const b = visibleBars[i];
      const x = i * barWidth + barWidth / 2;
      const dateLabel = new Date(b.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      ctx.fillText(dateLabel, x, height - 8);
    }

    // ─── 7. Interactive Mouse Crosshair ───────────────────────────────────────
    if (mousePos && mousePos.x >= 0 && mousePos.x <= chartWidth && mousePos.y >= chartTop && mousePos.y <= chartBottom) {
      // Draw subtle crosshair lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(mousePos.x, chartTop);
      ctx.lineTo(mousePos.x, chartBottom);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, mousePos.y);
      ctx.lineTo(chartWidth, mousePos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Price Pill in Right Gutter
      const hoveredPrice = maxPrice - ((mousePos.y - chartTop) / chartHeight) * priceRange;
      ctx.fillStyle = '#2962FF';
      ctx.beginPath();
      ctx.roundRect(chartWidth + 4, mousePos.y - 10, priceGutterWidth - 8, 20, 4);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(hoveredPrice.toFixed(2), chartWidth + priceGutterWidth / 2, mousePos.y + 3.5);
    }
  }, [currentBarIndex, playbackData, mousePos, canvasWidth]);

  // ─── Synchronized Equity Curve Canvas Renderer ──────────────────────────────
  useEffect(() => {
    const canvas = equityCanvasRef.current;
    if (!canvas || !playbackData || !playbackData.equityCurve || playbackData.equityCurve.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const containerWidth = canvasWidth || canvas.parentElement?.clientWidth || 900;
    const height = 130;

    canvas.width = containerWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const priceGutterWidth = 75;
    const plotWidth = containerWidth - priceGutterWidth;
    const plotHeight = height - 26;

    ctx.fillStyle = '#06090E';
    ctx.fillRect(0, 0, containerWidth, height);

    const fullCurve = playbackData.equityCurve;
    const visibleCurve = fullCurve.slice(0, currentBarIndex + 1);

    if (visibleCurve.length < 2) return;

    const allValues = fullCurve.map((p) => p.value);
    const minVal = Math.min(...allValues, 100000) * 0.985;
    const maxVal = Math.max(...allValues, 100000) * 1.015;
    const valRange = maxVal - minVal || 1;

    const getX = (idx: number) => 10 + (idx / (fullCurve.length - 1)) * (plotWidth - 20);
    const getY = (val: number) => height - 12 - ((val - minVal) / valRange) * plotHeight;

    // Grid Lines & Right Axis
    ctx.strokeStyle = '#121824';
    ctx.lineWidth = 1;
    for (let s = 0; s <= 3; s++) {
      const v = minVal + (valRange / 3) * s;
      const y = getY(v);

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotWidth, y);
      ctx.stroke();

      ctx.fillStyle = '#5A6A85';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`$${(v / 1000).toFixed(1)}k`, plotWidth + 10, y + 3.5);
    }

    // Gutter border
    ctx.strokeStyle = '#1A2333';
    ctx.beginPath();
    ctx.moveTo(plotWidth, 0);
    ctx.lineTo(plotWidth, height);
    ctx.stroke();

    // Baseline $100k Benchmark line
    const baseLineY = getY(100000);
    ctx.strokeStyle = '#253046';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(10, baseLineY);
    ctx.lineTo(plotWidth, baseLineY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Fill Gradient
    const currentVal = visibleCurve[visibleCurve.length - 1].value;
    const isProfitable = currentVal >= 100000;
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, isProfitable ? 'rgba(8, 153, 129, 0.3)' : 'rgba(242, 54, 69, 0.3)');
    gradient.addColorStop(1, 'rgba(6, 9, 14, 0)');

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(visibleCurve[0].value));
    visibleCurve.forEach((pt, idx) => {
      ctx.lineTo(getX(idx), getY(pt.value));
    });
    ctx.lineTo(getX(visibleCurve.length - 1), height - 12);
    ctx.lineTo(getX(0), height - 12);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Curve Line
    ctx.strokeStyle = isProfitable ? '#089981' : '#F23645';
    ctx.lineWidth = 2;
    ctx.beginPath();
    visibleCurve.forEach((pt, idx) => {
      if (idx === 0) ctx.moveTo(getX(idx), getY(pt.value));
      else ctx.lineTo(getX(idx), getY(pt.value));
    });
    ctx.stroke();

    // Highlight Dot on latest position
    const latestX = getX(visibleCurve.length - 1);
    const latestY = getY(currentVal);
    ctx.fillStyle = isProfitable ? '#089981' : '#F23645';
    ctx.beginPath();
    ctx.arc(latestX, latestY, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }, [currentBarIndex, playbackData, canvasWidth]);

  // Handle Chart Canvas Mouse Interaction
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = chartCanvasRef.current;
    if (!canvas || !playbackData || !playbackData.bars) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMousePos({ x, y });

    const priceGutterWidth = 75;
    const chartWidth = rect.width - priceGutterWidth;
    const maxVisibleBars = Math.min(100, Math.max(30, Math.floor(chartWidth / 9)));
    const endIndex = Math.min(currentBarIndex, playbackData.bars.length - 1);
    const startIndex = Math.max(0, endIndex - maxVisibleBars + 1);
    const barWidth = chartWidth / maxVisibleBars;

    const visibleIdx = Math.floor(x / barWidth);
    const targetIdx = startIndex + visibleIdx;
    if (targetIdx >= 0 && targetIdx < playbackData.bars.length) {
      setHoveredBarIndex(targetIdx);
    }
  };

  const handleCanvasMouseLeave = () => {
    setMousePos(null);
    setHoveredBarIndex(null);
  };

  // Inspect bar (hovered or latest active bar)
  const activeDisplayBar = (hoveredBarIndex !== null && playbackData?.bars?.[hoveredBarIndex])
    ? playbackData.bars[hoveredBarIndex]
    : playbackData?.bars?.[currentBarIndex];

  const totalBarsCount = playbackData?.bars?.length ?? 0;
  const currentEquityValue = playbackData?.equityCurve?.[currentBarIndex]?.value ?? 100000;
  const currentReturnPct = (((currentEquityValue - 100000) / 100000) * 100).toFixed(2);

  return (
    <div className="workspace-scroll backtest-dashboard max-w-[1400px] mx-auto py-6 px-4 md:px-8 space-y-6 animate-fade-in">
      {/* ─── Top Header Banner ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-1 text-[10px] font-mono font-bold bg-[#2962FF]/15 text-[#2962FF] border border-[#2962FF]/30 rounded-md uppercase tracking-widest shadow-[0_0_12px_rgba(41,98,255,0.2)]">
              SIMULATION DESK
            </span>
            <span className="text-xs font-mono text-[#606E85]">· Point-in-Time Verified Engine</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black font-mono tracking-tight text-[#F0F4F8] uppercase">
            Backtest &amp; Visual Replay
          </h2>
          <p className="text-xs text-[#787B86] mt-1.5 max-w-xl font-mono leading-relaxed">
            Simulate rule execution over market history with realistic next-bar-open fills and interactive bar-by-bar playback.
          </p>
        </div>

        {/* Status Pill */}
        {playbackData && (
          <div className="flex items-center gap-3.5 px-4 py-2.5 bg-[#0C1019] border border-[#1E273A] rounded-xl shadow-lg">
            <div className="w-2.5 h-2.5 rounded-full bg-[#089981] animate-pulse shadow-[0_0_8px_#089981]" />
            <div className="flex flex-col">
              <span className="text-[10px] font-mono text-[#606E85] uppercase">Active Simulation</span>
              <span className="text-xs font-mono font-bold text-[#F0F4F8]">
                {playbackData.symbol} <span className="text-[#2962FF]">({playbackData.setupName})</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Simulation Parameters Card ─── */}
      <section className="workspace-card rounded-2xl border border-[#1A2234] bg-[#0A0E18]/90 backdrop-blur-md shadow-xl overflow-hidden">
        <div className="card-heading flex-wrap gap-3 border-b border-[#1A2234] px-6 py-4 bg-[#080B13]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-[#2962FF]/10 text-[#2962FF]">
              <Sliders size={15} />
            </div>
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#F0F4F8]">
              Strategy Parameters
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-[#606E85] uppercase font-bold mr-1">Range Presets:</span>
            {[
              { label: '3M', m: 3 },
              { label: '6M', m: 6 },
              { label: '1Y', m: 12 },
              { label: '3Y', m: 36 },
            ].map(({ label, m }) => (
              <button
                key={label}
                onClick={() => handleSetPresetRange(m)}
                className="px-3 py-1.5 bg-[#0D121F] border border-[#1E273A] hover:border-[#2962FF] text-[#F0F4F8] hover:text-[#2962FF] hover:bg-[#2962FF]/10 text-[10px] font-mono font-bold rounded-lg transition-all duration-150 cursor-pointer"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-5 bg-[#090D16]">
          {/* Setup Strategy Feature Box */}
          <div className="flex flex-col gap-2 p-3.5 bg-[#060910] border border-[#161E2E] hover:border-[#2962FF]/50 rounded-xl transition-all duration-200 shadow-inner group">
            <label className="text-[10px] font-mono font-bold text-[#787B86] group-hover:text-[#2962FF] uppercase tracking-wider flex items-center gap-1.5 transition-colors">
              <Layers size={13} className="text-[#2962FF]" />
              Setup Strategy
            </label>
            <select
              value={selectedSetup}
              onChange={(e) => setSelectedSetup(e.target.value)}
              className="w-full h-10 px-3 bg-[#0A0E18] border border-[#1A2438] focus:border-[#2962FF] focus:ring-2 focus:ring-[#2962FF]/30 rounded-lg text-xs font-mono text-[#F0F4F8] transition-all outline-none"
            >
              {setups.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* From Date Feature Box */}
          <div className="flex flex-col gap-2 p-3.5 bg-[#060910] border border-[#161E2E] hover:border-[#2962FF]/50 rounded-xl transition-all duration-200 shadow-inner group">
            <label className="text-[10px] font-mono font-bold text-[#787B86] group-hover:text-[#2962FF] uppercase tracking-wider flex items-center gap-1.5 transition-colors">
              <Calendar size={13} className="text-[#2962FF]" />
              From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-10 px-3 bg-[#0A0E18] border border-[#1A2438] focus:border-[#2962FF] focus:ring-2 focus:ring-[#2962FF]/30 rounded-lg text-xs font-mono text-[#F0F4F8] transition-all outline-none"
            />
          </div>

          {/* To Date Feature Box */}
          <div className="flex flex-col gap-2 p-3.5 bg-[#060910] border border-[#161E2E] hover:border-[#2962FF]/50 rounded-xl transition-all duration-200 shadow-inner group">
            <label className="text-[10px] font-mono font-bold text-[#787B86] group-hover:text-[#2962FF] uppercase tracking-wider flex items-center gap-1.5 transition-colors">
              <Calendar size={13} className="text-[#2962FF]" />
              To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full h-10 px-3 bg-[#0A0E18] border border-[#1A2438] focus:border-[#2962FF] focus:ring-2 focus:ring-[#2962FF]/30 rounded-lg text-xs font-mono text-[#F0F4F8] transition-all outline-none"
            />
          </div>

          {/* Run Action Button Container */}
          <div className="flex flex-col justify-end">
            <button
              onClick={handleRun}
              disabled={!selectedSetup || status === 'running'}
              className={`w-full h-[62px] font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
                status === 'running'
                  ? 'bg-[#121724] text-[#606E85] border border-[#1A2234] cursor-not-allowed'
                  : 'bg-gradient-to-r from-[#2962FF] to-[#1E4BD8] hover:from-[#3872FF] hover:to-[#2558F0] text-white shadow-[0_0_20px_rgba(41,98,255,0.35)] hover:shadow-[0_0_25px_rgba(41,98,255,0.6)] hover:scale-[1.02] active:scale-[0.98]'
              }`}
            >
              {status === 'running' ? (
                <>
                  <Activity className="animate-spin text-[#2962FF]" size={16} />
                  <span>Simulating ({progress}%)</span>
                </>
              ) : (
                <>
                  <Zap size={16} fill="currentColor" />
                  <span>Run Backtest</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Animated Progress Bar */}
        {status === 'running' && (
          <div className="w-full bg-[#060910] h-2 overflow-hidden">
            <div
              className="bg-[#2962FF] h-full transition-all duration-300 ease-out shadow-[0_0_12px_#2962FF]"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </section>

      {/* ─── Visual Replay Deck & Candlestick Workspace ─── */}
      {playbackData && (
        <section
          ref={chartContainerRef}
          className="workspace-card rounded-2xl border border-[#1A2234] bg-[#0A0E18]/95 backdrop-blur-md shadow-2xl overflow-hidden animate-fade-in"
        >
          {/* Deck Header & Replay Control Toolbar */}
          <div className="px-6 py-4 border-b border-[#1A2234] bg-[#080B13] flex flex-wrap items-center justify-between gap-4">
            {/* Left Status & Symbol Tag */}
            <div className="flex items-center gap-3.5">
              <span className="px-2.5 py-1 text-[10px] font-mono font-bold bg-[#2962FF]/15 text-[#2962FF] border border-[#2962FF]/30 rounded-md uppercase tracking-wide">
                REPLAY ACTIVE
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-bold font-mono text-[#F0F4F8]">
                  {playbackData.symbol} <span className="text-[#606E85] font-normal">·</span> {playbackData.setupName}
                </span>
                <span className="text-[10px] font-mono text-[#606E85]">
                  Bar <strong className="text-[#F0F4F8]">{currentBarIndex + 1}</strong> of{' '}
                  <strong className="text-[#F0F4F8]">{totalBarsCount}</strong>
                </span>
              </div>
            </div>

            {/* Center: Playback Controls */}
            <div className="flex items-center gap-2 bg-[#060910] p-1.5 border border-[#1A2234] rounded-xl shadow-inner">
              <button
                onClick={() => {
                  setCurrentBarIndex(0);
                  setIsPlaying(true);
                }}
                title="Restart from Beginning"
                className="w-9 h-9 flex items-center justify-center text-[#787B86] hover:text-[#F0F4F8] hover:bg-[#121826] rounded-lg transition-all cursor-pointer"
              >
                <RotateCcw size={14} />
              </button>

              <button
                onClick={() => {
                  setCurrentBarIndex((prev) => Math.max(0, prev - 1));
                  setIsPlaying(false);
                }}
                title="Step 1 Bar Backward"
                className="w-9 h-9 flex items-center justify-center text-[#787B86] hover:text-[#F0F4F8] hover:bg-[#121826] rounded-lg transition-all cursor-pointer"
              >
                <ChevronLeft size={18} />
              </button>

              <button
                onClick={() => setIsPlaying(!isPlaying)}
                title={isPlaying ? 'Pause (Space)' : 'Play Replay (Space)'}
                className="w-11 h-9 flex items-center justify-center bg-[#2962FF] hover:bg-[#1E4BD8] text-white rounded-lg shadow-[0_0_15px_rgba(41,98,255,0.4)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                {isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
              </button>

              <button
                onClick={() => {
                  setCurrentBarIndex((prev) => Math.min(totalBarsCount - 1, prev + 1));
                  setIsPlaying(false);
                }}
                title="Step 1 Bar Forward"
                className="w-9 h-9 flex items-center justify-center text-[#787B86] hover:text-[#F0F4F8] hover:bg-[#121826] rounded-lg transition-all cursor-pointer"
              >
                <ChevronRight size={18} />
              </button>

              <button
                onClick={handleJumpToNextTrade}
                title="Skip to Next Trade"
                className="px-3 h-9 flex items-center gap-1.5 text-xs font-mono font-bold text-[#F0F4F8] hover:bg-[#121826] rounded-lg transition-all cursor-pointer border-l border-[#1A2234] ml-1"
              >
                <SkipForward size={14} className="text-[#2962FF]" />
                <span className="text-[11px]">Next Trade</span>
              </button>
            </div>

            {/* Right: Speed Pills */}
            <div className="flex items-center border border-[#1A2234] bg-[#060910] p-1 rounded-xl shadow-inner gap-1">
              {[
                { label: '1x', val: 2 },
                { label: '5x', val: 5 },
                { label: '20x', val: 20 },
                { label: 'Max', val: 60 },
              ].map(({ label, val }) => (
                <button
                  key={label}
                  onClick={() => setPlaybackSpeed(val)}
                  className={`px-3 py-1 text-[10px] font-mono font-bold rounded-lg transition-all cursor-pointer ${
                    playbackSpeed === val
                      ? 'bg-[#2962FF] text-white shadow-md'
                      : 'text-[#606E85] hover:text-white bg-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Bar Info & Floating Indicator HUD */}
          <div className="mx-6 my-3 px-5 py-2.5 bg-[#060910]/90 border border-[#161E2E] rounded-xl flex flex-wrap items-center justify-between text-xs font-mono shadow-md backdrop-blur-md">
            {activeDisplayBar ? (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <span className="text-[#606E85]">
                  {new Date(activeDisplayBar.time).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                <span>
                  O: <strong className="text-[#F0F4F8]">${activeDisplayBar.open.toFixed(2)}</strong>
                </span>
                <span>
                  H: <strong className="text-[#F0F4F8]">${activeDisplayBar.high.toFixed(2)}</strong>
                </span>
                <span>
                  L: <strong className="text-[#F0F4F8]">${activeDisplayBar.low.toFixed(2)}</strong>
                </span>
                <span>
                  C:{' '}
                  <strong
                    className={activeDisplayBar.close >= activeDisplayBar.open ? 'text-[#089981]' : 'text-[#F23645]'}
                  >
                    ${activeDisplayBar.close.toFixed(2)}
                  </strong>
                </span>
                <span>
                  Vol: <strong className="text-[#606E85]">{(activeDisplayBar.volume / 1000).toFixed(0)}k</strong>
                </span>
              </div>
            ) : (
              <span className="text-[#606E85]">Loading chart series...</span>
            )}

            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2962FF] shadow-[0_0_6px_#2962FF]" />
                <span className="text-[#606E85]">SMA14:</span>
                <strong className="text-[#F0F4F8]">
                  {activeDisplayBar?.indicators?.SMA14 != null ? `$${activeDisplayBar.indicators.SMA14}` : '—'}
                </strong>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#A855F7] shadow-[0_0_6px_#A855F7]" />
                <span className="text-[#606E85]">EMA20:</span>
                <strong className="text-[#F0F4F8]">
                  {activeDisplayBar?.indicators?.EMA20 != null ? `$${activeDisplayBar.indicators.EMA20}` : '—'}
                </strong>
              </span>
            </div>
          </div>

          {/* Candlestick Canvas Replay Viewport */}
          <div className="relative w-full bg-[#06090E] cursor-crosshair">
            <canvas
              ref={chartCanvasRef}
              onMouseMove={handleCanvasMouseMove}
              onMouseLeave={handleCanvasMouseLeave}
              className="w-full block"
            />
          </div>

          {/* Timeline Scrubber Slider with Trade Event Pips */}
          <div className="px-6 py-4 bg-[#080B13] border-t border-b border-[#1A2234] flex flex-col gap-2.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-[#787B86]">
                Timeline Scrub: Bar <strong className="text-[#F0F4F8]">{currentBarIndex + 1}</strong> of{' '}
                <strong className="text-[#F0F4F8]">{totalBarsCount}</strong>
              </span>
              <div className="flex items-center gap-5">
                <span className="text-[#787B86]">
                  Simulated Balance:{' '}
                  <strong className="text-[#F0F4F8]">${currentEquityValue.toLocaleString()}</strong>
                </span>
                <span className="font-bold flex items-center gap-1.5">
                  <span className="text-[#787B86]">Total P&amp;L:</span>
                  <span className={Number(currentReturnPct) >= 0 ? 'text-[#089981]' : 'text-[#F23645]'}>
                    {Number(currentReturnPct) >= 0 ? '+' : ''}
                    {currentReturnPct}%
                  </span>
                </span>
              </div>
            </div>

            {/* Slider with styled track */}
            <div className="relative w-full flex items-center">
              <input
                type="range"
                min={0}
                max={Math.max(0, totalBarsCount - 1)}
                value={currentBarIndex}
                onChange={(e) => {
                  setCurrentBarIndex(Number(e.target.value));
                  setIsPlaying(false);
                }}
                className="w-full accent-[#2962FF] cursor-pointer h-2 bg-[#121824] rounded-lg focus:outline-none"
              />
            </div>
          </div>

          {/* Synchronized Equity Curve Deck */}
          <div className="p-6 bg-[#06090E]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#787B86] font-bold flex items-center gap-1.5">
                <Activity size={13} className="text-[#089981]" />
                Account Equity Curve (Initial Capital $100,000)
              </span>
              <span className="text-[11px] font-mono text-[#606E85]">
                Peak Balance: <strong className="text-[#F0F4F8]">${Math.max(...(playbackData.equityCurve?.map(p => p.value) || [100000])).toLocaleString()}</strong>
              </span>
            </div>
            <div className="border border-[#141C2C] rounded-xl overflow-hidden p-2 bg-[#05070B]">
              <canvas ref={equityCanvasRef} className="w-full block" />
            </div>
          </div>
        </section>
      )}

      {/* ─── Performance Report Grid ─── */}
      {playbackData?.result && (
        <section className="workspace-card rounded-2xl border border-[#1A2234] bg-[#0A0E18]/90 backdrop-blur-md shadow-xl overflow-hidden animate-fade-in">
          <div className="card-heading border-b border-[#1A2234] px-6 py-4 bg-[#080B13]">
            <span className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-[#F0F4F8]">
              <CheckCircle2 size={15} className="text-[#089981]" />
              Simulation Performance Report
            </span>
            <small className="text-[#089981] font-mono font-bold uppercase text-[10px]">
              Verified · Zero Lookahead
            </small>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 p-6 bg-[#090D16]">
            <div className="p-5 bg-[#060910] border border-[#161E2E] hover:border-[#2962FF]/40 rounded-xl flex flex-col gap-1.5 transition-all duration-200 hover:-translate-y-1 shadow-lg group">
              <span className="text-[10px] font-mono font-bold text-[#787B86] group-hover:text-[#2962FF] uppercase tracking-wider flex items-center gap-1.5 transition-colors">
                <Target size={13} className="text-[#2962FF]" />
                Win Rate
              </span>
              <span className="text-2xl font-black font-mono text-[#089981]">
                {playbackData.result.winRate.toFixed(1)}%
              </span>
              <span className="text-[10px] font-mono text-[#606E85]">
                {playbackData.result.wins} Wins / {playbackData.result.losses} Losses
              </span>
            </div>

            <div className="p-5 bg-[#060910] border border-[#161E2E] hover:border-[#A855F7]/40 rounded-xl flex flex-col gap-1.5 transition-all duration-200 hover:-translate-y-1 shadow-lg group">
              <span className="text-[10px] font-mono font-bold text-[#787B86] group-hover:text-[#A855F7] uppercase tracking-wider flex items-center gap-1.5 transition-colors">
                <Layers size={13} className="text-[#A855F7]" />
                Total Trades
              </span>
              <span className="text-2xl font-black font-mono text-[#F0F4F8]">
                {playbackData.result.totalTrades}
              </span>
              <span className="text-[10px] font-mono text-[#606E85]">Closed positions</span>
            </div>

            <div className="p-5 bg-[#060910] border border-[#161E2E] hover:border-[#089981]/40 rounded-xl flex flex-col gap-1.5 transition-all duration-200 hover:-translate-y-1 shadow-lg group">
              <span className="text-[10px] font-mono font-bold text-[#787B86] group-hover:text-[#089981] uppercase tracking-wider flex items-center gap-1.5 transition-colors">
                <TrendingUp size={13} className="text-[#089981]" />
                Avg. Trade Return
              </span>
              <span
                className={`text-2xl font-black font-mono ${
                  playbackData.result.avgReturnPct >= 0 ? 'text-[#089981]' : 'text-[#F23645]'
                }`}
              >
                {playbackData.result.avgReturnPct >= 0 ? '+' : ''}
                {playbackData.result.avgReturnPct.toFixed(2)}%
              </span>
              <span className="text-[10px] font-mono text-[#606E85]">Per-trade expectancy</span>
            </div>

            <div className="p-5 bg-[#060910] border border-[#161E2E] hover:border-[#F23645]/40 rounded-xl flex flex-col gap-1.5 transition-all duration-200 hover:-translate-y-1 shadow-lg group">
              <span className="text-[10px] font-mono font-bold text-[#787B86] group-hover:text-[#F23645] uppercase tracking-wider flex items-center gap-1.5 transition-colors">
                <ShieldAlert size={13} className="text-[#F23645]" />
                Max Drawdown
              </span>
              <span className="text-2xl font-black font-mono text-[#F23645]">
                {playbackData.result.maxDrawdownPct.toFixed(2)}%
              </span>
              <span className="text-[10px] font-mono text-[#606E85]">Peak-to-trough drop</span>
            </div>
          </div>
        </section>
      )}

      {/* ─── Executed Trade Log Table ─── */}
      {playbackData?.trades && playbackData.trades.length > 0 && (
        <section className="workspace-card rounded-2xl border border-[#1A2234] bg-[#0A0E18]/90 backdrop-blur-md shadow-xl overflow-hidden animate-fade-in">
          <div className="card-heading border-b border-[#1A2234] px-6 py-4 bg-[#080B13]">
            <span className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-[#F0F4F8]">
              <Layers size={14} className="text-[#2962FF]" />
              Executed Trade Log ({playbackData.trades.length})
            </span>
            <small className="text-[#606E85] text-[10px] font-mono">
              Click Replay to jump camera directly to any trade
            </small>
          </div>

          <div className="table-wrap overflow-x-auto bg-[#090D16]">
            <table className="data-table w-full">
              <thead>
                <tr className="border-b border-[#1A2234] text-left text-[10px] font-mono text-[#606E85] uppercase tracking-wider bg-[#060910]">
                  <th className="p-3.5">#</th>
                  <th className="p-3.5">Entry Date &amp; Price</th>
                  <th className="p-3.5">Exit Date &amp; Price</th>
                  <th className="p-3.5">Exit Reason</th>
                  <th className="p-3.5 text-right">Return %</th>
                  <th className="p-3.5 text-center">Outcome</th>
                  <th className="p-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {playbackData.trades.map((trade, idx) => {
                  const isWin = trade.result === 'win';
                  const isCurrent = selectedTrade?.id === trade.id;
                  return (
                    <tr
                      key={trade.id || idx}
                      onClick={() => handleSelectTrade(trade)}
                      className={`border-b border-[#121826] font-mono text-xs cursor-pointer transition-colors duration-150 ${
                        isCurrent ? 'bg-[#151D2E]' : 'hover:bg-[#0D121D]'
                      }`}
                    >
                      <td className="p-3.5 text-[#606E85]">#{idx + 1}</td>
                      <td className="p-3.5">
                        <div className="flex flex-col">
                          <span className="text-[#F0F4F8] font-bold">
                            ${trade.entryPrice.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-[#606E85]">
                            {new Date(trade.entryDate).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <div className="flex flex-col">
                          <span className="text-[#F0F4F8] font-bold">
                            ${trade.exitPrice.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-[#606E85]">
                            {new Date(trade.exitDate).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className="text-[10px] px-2.5 py-1 bg-[#060910] border border-[#1A2234] text-[#787B86] uppercase font-bold rounded-md">
                          {trade.exitReason.replace('_', ' ')}
                        </span>
                      </td>
                      <td className={`p-3.5 text-right font-bold ${isWin ? 'text-[#089981]' : 'text-[#F23645]'}`}>
                        {isWin ? '+' : ''}
                        {trade.returnPct.toFixed(2)}%
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`text-[10px] px-2.5 py-1 font-bold uppercase rounded-md border ${
                            isWin
                              ? 'bg-[#089981]/15 text-[#089981] border-[#089981]/30'
                              : 'bg-[#F23645]/15 text-[#F23645] border-[#F23645]/30'
                          }`}
                        >
                          {trade.result}
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectTrade(trade);
                          }}
                          className="px-3 py-1 bg-[#2962FF]/15 hover:bg-[#2962FF] text-[#2962FF] hover:text-white border border-[#2962FF]/30 rounded-lg text-[10px] font-mono font-bold transition-all duration-150 cursor-pointer shadow-sm hover:shadow-[0_0_10px_rgba(41,98,255,0.4)]"
                        >
                          Replay
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
