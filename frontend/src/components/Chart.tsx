import { useEffect, useRef, useState } from 'react';
import {
  init,
  dispose,
  Chart as KLineChart,
  OverlayCreate,
  LineType,
  PolygonType,
} from 'klinecharts';
import { useSocketStore } from '../store/socketStore';
import { api } from '../lib/api';
import {
  TrendingUp,
  Minus,
  Square,
  Trash2,
  Type,
  MousePointer2,
  BarChart2,
  Activity,
  Layers,
  Sparkles,
  ArrowUpRight,
  SplitSquareVertical,
  ChevronDown,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  Check,
} from 'lucide-react';

interface ChartProps {
  symbol: string;
}

type DrawingTool =
  | 'cursor'
  | 'segment'
  | 'straightLine'
  | 'rayLine'
  | 'horizontalStraightLine'
  | 'priceLine'
  | 'rect'
  | 'parallelStraightLine'
  | 'fibonacciLine'
  | 'simpleAnnotation';

const TIMEFRAME_OPTIONS = [
  { group: 'Minutes', items: [
    { label: '1m', value: '1' },
    { label: '5m', value: '5' },
    { label: '15m', value: '15' },
    { label: '30m', value: '30' },
  ]},
  { group: 'Hours', items: [
    { label: '1h', value: '60' },
  ]},
  { group: 'Days / Weeks', items: [
    { label: '1D', value: 'D' },
    { label: '1W', value: 'W' },
    { label: '1M', value: 'M' },
  ]},
];

const AVAILABLE_INDICATORS = [
  { id: 'MA', name: 'Moving Average (MA)', subPane: false, color: '#FF9800' },
  { id: 'EMA', name: 'Exponential Moving Avg (EMA)', subPane: false, color: '#29B6F6' },
  { id: 'BOLL', name: 'Bollinger Bands (BOLL)', subPane: false, color: '#AB47BC' },
  { id: 'VOL', name: 'Volume (VOL)', subPane: true, color: '#00E676' },
  { id: 'RSI', name: 'Relative Strength Index (RSI)', subPane: true, color: '#26A69A' },
  { id: 'MACD', name: 'Moving Avg Convergence (MACD)', subPane: true, color: '#EC407A' },
  { id: 'KDJ', name: 'KDJ Stochastic Oscillator', subPane: true, color: '#FFD54F' },
];

export default function Chart({ symbol }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<KLineChart | null>(null);

  // States
  const [activeDrawing, setActiveDrawing] = useState<DrawingTool>('cursor');
  const [resolution, setResolution] = useState<string>('D');
  const [activeIndicators, setActiveIndicators] = useState<string[]>(['VOL', 'MA']);
  const [chartType, setChartType] = useState<'candle_solid' | 'area' | 'line'>('candle_solid');
  
  // Dropdown states
  const [isTimeframeOpen, setIsTimeframeOpen] = useState(false);
  const [isIndicatorsOpen, setIsIndicatorsOpen] = useState(false);
  const [isStyleOpen, setIsStyleOpen] = useState(false);

  // Drawing modifiers
  const [isDrawingsLocked, setIsDrawingsLocked] = useState(false);
  const [isDrawingsVisible, setIsDrawingsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Hovered / Live OHLC legend data
  const [ohlc, setOhlc] = useState<{
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    change?: number;
    changePct?: number;
  }>({});

  // Real-time live price
  const livePrice = useSocketStore((state) => state.prices[symbol]);

  const cleanSymbol = symbol.replace(/^BINANCE:/i, '').replace(/USDT$/i, '');
  const exchange = symbol.startsWith('BINANCE:') ? 'CRYPTO' : 'NASDAQ';

  // Initialize and load historical data
  useEffect(() => {
    if (!chartRef.current || !symbol) return;

    const chart = init(chartRef.current, {
      styles: {
        grid: {
          horizontal: { color: '#131722', size: 1 },
          vertical: { color: '#131722', size: 1 },
        },
        candle: {
          type: chartType as any,
          bar: {
            upColor: '#089981',
            downColor: '#F23645',
            noChangeColor: '#787B86',
            upBorderColor: '#089981',
            downBorderColor: '#F23645',
            noChangeBorderColor: '#787B86',
            upWickColor: '#089981',
            downWickColor: '#F23645',
            noChangeWickColor: '#787B86',
          },
          area: {
            lineColor: '#2962FF',
            backgroundColor: [
              { offset: 0, color: 'rgba(41, 98, 255, 0.28)' },
              { offset: 1, color: 'rgba(41, 98, 255, 0.02)' },
            ],
          },
        },
        indicator: {
          bars: [
            {
              style: PolygonType.Fill,
              upColor: 'rgba(8, 153, 129, 0.65)',
              downColor: 'rgba(242, 54, 69, 0.65)',
              noChangeColor: '#787B86',
            },
          ],
          lines: [
            { color: '#FF9800', size: 1.5 },
            { color: '#29B6F6', size: 1.5 },
            { color: '#AB47BC', size: 1.5 },
            { color: '#EC407A', size: 1.5 },
          ],
        },
        overlay: {
          line: {
            color: '#2962FF',
            size: 2,
          },
          rect: {
            style: PolygonType.StrokeFill,
            color: 'rgba(168, 85, 247, 0.18)',
            borderColor: '#A855F7',
            borderSize: 1.5,
          },
        },
        yAxis: {
          axisLine: { color: '#1E222D', size: 1 },
          tickText: { color: '#787B86', family: 'system-ui, sans-serif', size: 11 },
        },
        xAxis: {
          axisLine: { color: '#1E222D', size: 1 },
          tickText: { color: '#787B86', family: 'system-ui, sans-serif', size: 11 },
        },
        crosshair: {
          horizontal: {
            line: { color: '#787B86', style: LineType.Dashed, dashedValue: [4, 4] },
            text: { backgroundColor: '#1E222D', color: '#D1D4DC' },
          },
          vertical: {
            line: { color: '#787B86', style: LineType.Dashed, dashedValue: [4, 4] },
            text: { backgroundColor: '#1E222D', color: '#D1D4DC' },
          },
        },
      },
    });

    chartInstance.current = chart;

    // Apply default main indicators
    chart?.createIndicator('MA', false, { id: 'candle_pane' });
    chart?.createIndicator('VOL', false, { id: 'pane_vol', height: 80 });

    // Track crosshair hover for TradingView-style top OHLC bar
    chart?.subscribeAction('onCrosshairChange' as any, (data: any) => {
      if (data && data.kLineData) {
        const k = data.kLineData;
        const change = k.close - k.open;
        const changePct = k.open ? (change / k.open) * 100 : 0;
        setOhlc({
          open: k.open,
          high: k.high,
          low: k.low,
          close: k.close,
          change,
          changePct,
        });
      }
    });

    // Fetch historical candles
    const fetchHistory = async () => {
      try {
        const res = await api.getCandles(cleanSymbol, resolution, 0, 0);
        if (res && res.t && res.t.length > 0) {
          const kLineData = res.t.map((timestamp: number, i: number) => ({
            timestamp: timestamp * 1000,
            open: res.o[i],
            high: res.h[i],
            low: res.l[i],
            close: res.c[i],
            volume: res.v[i],
          }));

          chart?.applyNewData(kLineData);

          // Set default legend to the latest candle
          const lastIndex = kLineData.length - 1;
          const latest = kLineData[lastIndex];
          const change = latest.close - latest.open;
          const changePct = latest.open ? (change / latest.open) * 100 : 0;
          setOhlc({
            open: latest.open,
            high: latest.high,
            low: latest.low,
            close: latest.close,
            change,
            changePct,
          });
        }
      } catch (err) {
        console.error('Failed to load historical data', err);
      }
    };

    fetchHistory();

    const handleResize = () => chart?.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstance.current) {
        dispose(chartRef.current!);
      }
    };
  }, [symbol, resolution]);

  // Update chart style if user changes candles / line / area
  useEffect(() => {
    if (chartInstance.current) {
      chartInstance.current.setStyles({
        candle: {
          type: chartType as any,
        },
      });
    }
  }, [chartType]);

  // Update chart with live streaming price
  useEffect(() => {
    if (chartInstance.current && livePrice) {
      chartInstance.current.updateData({
        timestamp: livePrice.timestamp * 1000,
        open: livePrice.price,
        high: livePrice.price,
        low: livePrice.price,
        close: livePrice.price,
        volume: livePrice.volume || 0,
      });
    }
  }, [livePrice]);

  // Select drawing tool
  const handleSelectDrawing = (tool: DrawingTool) => {
    setActiveDrawing(tool);
    if (!chartInstance.current || tool === 'cursor') return;

    const overlayConfig: OverlayCreate = {
      name: tool,
      lock: isDrawingsLocked,
    };

    if (tool === 'rect') {
      overlayConfig.styles = {
        rect: {
          style: PolygonType.StrokeFill,
          color: 'rgba(168, 85, 247, 0.18)',
          borderColor: '#A855F7',
          borderSize: 1.5,
        },
      };
    } else if (tool === 'horizontalStraightLine') {
      overlayConfig.styles = {
        line: {
          color: '#089981',
          size: 1.5,
          style: LineType.Dashed,
          dashedValue: [4, 4],
        },
      };
    } else if (tool === 'segment' || tool === 'straightLine') {
      overlayConfig.styles = {
        line: {
          color: '#2962FF',
          size: 2,
        },
      };
    }

    chartInstance.current.createOverlay(overlayConfig);
  };

  // Clear all drawings
  const handleClearDrawings = () => {
    if (chartInstance.current) {
      chartInstance.current.removeOverlay();
      setActiveDrawing('cursor');
    }
  };

  // Toggle Indicator
  const toggleIndicator = (id: string, isSubPane: boolean) => {
    if (!chartInstance.current) return;
    const exists = activeIndicators.includes(id);

    if (exists) {
      chartInstance.current.removeIndicator(isSubPane ? `pane_${id.toLowerCase()}` : 'candle_pane', id);
      setActiveIndicators(activeIndicators.filter((i) => i !== id));
    } else {
      if (isSubPane) {
        chartInstance.current.createIndicator(id, false, { id: `pane_${id.toLowerCase()}`, height: 90 });
      } else {
        chartInstance.current.createIndicator(id, false, { id: 'candle_pane' });
      }
      setActiveIndicators([...activeIndicators, id]);
    }
  };

  // Auto Support/Resistance & Breakout detection
  const handleAutoSupportResistance = async () => {
    if (!chartInstance.current) return;
    try {
      const data = await api.getCandles(cleanSymbol, resolution, 0, 0);
      if (!data || !data.c || data.c.length < 20) return;

      const closes = data.c;
      const highs = data.h;
      const lows = data.l;

      let highest = -Infinity;
      let lowest = Infinity;
      const recentPeriod = Math.min(60, closes.length);

      for (let i = closes.length - recentPeriod; i < closes.length; i++) {
        if (highs[i] > highest) highest = highs[i];
        if (lows[i] < lowest) lowest = lows[i];
      }

      // Resistance Level
      chartInstance.current.createOverlay({
        name: 'horizontalStraightLine',
        points: [{ timestamp: data.t[data.t.length - 1] * 1000, value: highest }],
        styles: {
          line: { color: '#F23645', size: 1.5, style: LineType.Dashed, dashedValue: [6, 4] },
        },
      });

      // Support Level
      chartInstance.current.createOverlay({
        name: 'horizontalStraightLine',
        points: [{ timestamp: data.t[data.t.length - 1] * 1000, value: lowest }],
        styles: {
          line: { color: '#089981', size: 1.5, style: LineType.Dashed, dashedValue: [6, 4] },
        },
      });

      // Consolidation Breakout Box
      const boxStartTs = data.t[Math.max(0, data.t.length - 20)] * 1000;
      const boxEndTs = data.t[data.t.length - 1] * 1000;
      const boxHigh = Math.max(...highs.slice(-20));
      const boxLow = Math.min(...lows.slice(-20));

      chartInstance.current.createOverlay({
        name: 'rect',
        points: [
          { timestamp: boxStartTs, value: boxHigh },
          { timestamp: boxEndTs, value: boxLow },
        ],
        styles: {
          rect: {
            style: PolygonType.StrokeFill,
            color: 'rgba(168, 85, 247, 0.15)',
            borderColor: '#A855F7',
            borderSize: 1.5,
          },
        },
      });
    } catch (err) {
      console.error('Auto S/R calculation error', err);
    }
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!chartContainerRef.current) return;
    if (!document.fullscreenElement) {
      chartContainerRef.current.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  const isUp = (ohlc.change ?? 0) >= 0;

  return (
    <div
      ref={chartContainerRef}
      className="relative w-full h-full flex flex-col bg-[#131722] text-[#D1D4DC] select-none overflow-hidden font-sans border border-[#1E222D]"
    >
      {/* ─────────────────────────────────────────────────────────────
          1. TRADINGVIEW TOP NAVBAR
      ───────────────────────────────────────────────────────────── */}
      <header className="h-10 bg-[#131722] border-b border-[#1E222D] flex items-center justify-between px-2 gap-2 z-30 text-xs">
        {/* Left Section: Symbol, Timeframe dropdown, Chart Style, Indicators */}
        <div className="flex items-center gap-1.5 h-full">
          {/* Symbol & Exchange Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-[#1E222D]/80 hover:bg-[#2A2E39] transition-colors cursor-pointer border border-[#2A2E39]">
            <span className="font-bold text-[#F0F3FA] tracking-wide">{cleanSymbol}</span>
            <span className="text-[10px] px-1 py-0.2 bg-[#2A2E39] text-[#787B86] font-mono uppercase">
              {exchange}
            </span>
          </div>

          <div className="w-[1px] h-4 bg-[#2A2E39]" />

          {/* Quick Timeframes */}
          <div className="flex items-center">
            {['15', '60', 'D'].map((tf) => (
              <button
                key={tf}
                onClick={() => setResolution(tf)}
                className={`px-2 py-1 transition-colors ${
                  resolution === tf
                    ? 'text-[#2962FF] font-bold bg-[#2962FF]/10'
                    : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
                }`}
              >
                {tf === '15' ? '15m' : tf === '60' ? '1h' : '1D'}
              </button>
            ))}

            {/* Timeframe Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsTimeframeOpen(!isTimeframeOpen);
                  setIsIndicatorsOpen(false);
                  setIsStyleOpen(false);
                }}
                className="px-1.5 py-1 text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D] flex items-center gap-0.5"
              >
                <ChevronDown size={13} />
              </button>

              {isTimeframeOpen && (
                <div className="absolute top-8 left-0 w-36 bg-[#1E222D] border border-[#2A2E39] shadow-2xl py-1 z-50">
                  {TIMEFRAME_OPTIONS.map((group) => (
                    <div key={group.group} className="border-b border-[#2A2E39] last:border-0 py-1">
                      <div className="px-3 py-0.5 text-[10px] uppercase tracking-wider text-[#787B86] font-semibold">
                        {group.group}
                      </div>
                      {group.items.map((item) => (
                        <div
                          key={item.value}
                          onClick={() => {
                            setResolution(item.value);
                            setIsTimeframeOpen(false);
                          }}
                          className={`px-3 py-1 text-xs cursor-pointer flex items-center justify-between hover:bg-[#2A2E39] ${
                            resolution === item.value ? 'text-[#2962FF] font-bold' : 'text-[#D1D4DC]'
                          }`}
                        >
                          <span>{item.label}</span>
                          {resolution === item.value && <Check size={13} className="text-[#2962FF]" />}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="w-[1px] h-4 bg-[#2A2E39]" />

          {/* Chart Style Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setIsStyleOpen(!isStyleOpen);
                setIsTimeframeOpen(false);
                setIsIndicatorsOpen(false);
              }}
              className="flex items-center gap-1 px-2 py-1 text-[#D1D4DC] hover:bg-[#1E222D] transition-colors"
            >
              <BarChart2 size={15} className="text-[#787B86]" />
              <span className="capitalize">{chartType === 'candle_solid' ? 'Candles' : chartType}</span>
              <ChevronDown size={13} className="text-[#787B86]" />
            </button>

            {isStyleOpen && (
              <div className="absolute top-8 left-0 w-32 bg-[#1E222D] border border-[#2A2E39] shadow-2xl py-1 z-50">
                {[
                  { label: 'Candles', value: 'candle_solid' },
                  { label: 'Line', value: 'line' },
                  { label: 'Area', value: 'area' },
                ].map((st) => (
                  <div
                    key={st.value}
                    onClick={() => {
                      setChartType(st.value as any);
                      setIsStyleOpen(false);
                    }}
                    className={`px-3 py-1 text-xs cursor-pointer flex items-center justify-between hover:bg-[#2A2E39] ${
                      chartType === st.value ? 'text-[#2962FF] font-bold' : 'text-[#D1D4DC]'
                    }`}
                  >
                    <span>{st.label}</span>
                    {chartType === st.value && <Check size={13} className="text-[#2962FF]" />}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="w-[1px] h-4 bg-[#2A2E39]" />

          {/* Indicators Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setIsIndicatorsOpen(!isIndicatorsOpen);
                setIsTimeframeOpen(false);
                setIsStyleOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[#D1D4DC] hover:bg-[#1E222D] transition-colors"
            >
              <Activity size={15} className="text-[#2962FF]" />
              <span className="font-semibold">Indicators</span>
              <span className="text-[10px] px-1 bg-[#2A2E39] text-[#787B86]">
                {activeIndicators.length}
              </span>
              <ChevronDown size={13} className="text-[#787B86]" />
            </button>

            {isIndicatorsOpen && (
              <div className="absolute top-8 left-0 w-64 bg-[#1E222D] border border-[#2A2E39] shadow-2xl py-1.5 z-50">
                <div className="px-3 py-1 text-[11px] font-bold text-[#787B86] uppercase tracking-wider border-b border-[#2A2E39]">
                  Technical Indicators
                </div>
                {AVAILABLE_INDICATORS.map((ind) => {
                  const isActive = activeIndicators.includes(ind.id);
                  return (
                    <div
                      key={ind.id}
                      onClick={() => toggleIndicator(ind.id, ind.subPane)}
                      className={`px-3 py-1.5 text-xs cursor-pointer flex items-center justify-between hover:bg-[#2A2E39] transition-colors ${
                        isActive ? 'text-[#F0F3FA] font-medium' : 'text-[#787B86]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: ind.color }}
                        />
                        <span>{ind.name}</span>
                      </div>
                      {isActive && <Check size={14} className="text-[#2962FF]" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="w-[1px] h-4 bg-[#2A2E39]" />

          {/* Auto Support & Resistance Button */}
          <button
            onClick={handleAutoSupportResistance}
            title="Auto-detect Breakouts and Key Support/Resistance Levels"
            className="flex items-center gap-1 px-2.5 py-1 bg-[#1E222D] hover:bg-[#2A2E39] text-[#A855F7] border border-[#A855F7]/30 transition-colors font-medium"
          >
            <Sparkles size={13} />
            <span>AUTO S/R</span>
          </button>
        </div>

        {/* Right Section: Fullscreen & Quick actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="p-1.5 text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D] transition-colors"
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          2. TRADINGVIEW SUB-HEADER (LIVE TICKER & OHLC STRIP)
      ───────────────────────────────────────────────────────────── */}
      <div className="h-8 bg-[#131722] border-b border-[#1E222D] flex items-center justify-between px-3 text-xs font-mono z-20">
        {/* Symbol Title & Live OHLC info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#089981] animate-pulse" />
            <span className="text-[#F0F3FA] font-bold">{cleanSymbol}</span>
            <span className="text-[#787B86]">· {resolution} · {exchange}</span>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span>O: <strong className="text-[#D1D4DC]">{ohlc.open?.toFixed(2) ?? '—'}</strong></span>
            <span>H: <strong className="text-[#D1D4DC]">{ohlc.high?.toFixed(2) ?? '—'}</strong></span>
            <span>L: <strong className="text-[#D1D4DC]">{ohlc.low?.toFixed(2) ?? '—'}</strong></span>
            <span>C: <strong className="text-[#D1D4DC]">{ohlc.close?.toFixed(2) ?? '—'}</strong></span>
            {ohlc.change != null && (
              <span className={`font-semibold ${isUp ? 'text-[#089981]' : 'text-[#F23645]'}`}>
                {isUp ? '+' : ''}{ohlc.change.toFixed(2)} ({isUp ? '+' : ''}{ohlc.changePct?.toFixed(2)}%)
              </span>
            )}
          </div>
        </div>

        {/* Buy / Sell Quick Execution Badges */}
        <div className="flex items-center gap-1">
          <div className="flex items-center bg-[#F23645]/15 border border-[#F23645]/40 px-2 py-0.5 text-[11px] font-mono">
            <span className="text-[#F23645] font-bold mr-1">
              ${((ohlc.close ?? 310) * 0.9995).toFixed(2)}
            </span>
            <span className="text-[#787B86] text-[9px]">SELL</span>
          </div>
          <div className="flex items-center bg-[#089981]/15 border border-[#089981]/40 px-2 py-0.5 text-[11px] font-mono">
            <span className="text-[#089981] font-bold mr-1">
              ${((ohlc.close ?? 310) * 1.0005).toFixed(2)}
            </span>
            <span className="text-[#787B86] text-[9px]">BUY</span>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. MAIN WORKSPACE: TRADINGVIEW LEFT DRAWING RAIL + CHART CANVAS
      ───────────────────────────────────────────────────────────── */}
      <div className="relative flex-1 w-full h-full flex overflow-hidden">
        {/* Left Drawing Sidebar */}
        <aside className="w-12 bg-[#131722] border-r border-[#1E222D] flex flex-col items-center py-2 gap-1 z-20">
          {/* Pointer / Cursor */}
          <button
            onClick={() => handleSelectDrawing('cursor')}
            title="Crosshair / Move"
            className={`p-2 transition-colors ${
              activeDrawing === 'cursor'
                ? 'bg-[#2962FF] text-white'
                : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
            }`}
          >
            <MousePointer2 size={16} />
          </button>

          <div className="w-6 h-[1px] bg-[#1E222D] my-1" />

          {/* Trend Line */}
          <button
            onClick={() => handleSelectDrawing('segment')}
            title="Trend Line"
            className={`p-2 transition-colors ${
              activeDrawing === 'segment'
                ? 'bg-[#2962FF] text-white'
                : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
            }`}
          >
            <TrendingUp size={16} />
          </button>

          {/* Extended Line */}
          <button
            onClick={() => handleSelectDrawing('straightLine')}
            title="Extended Trend Line"
            className={`p-2 transition-colors ${
              activeDrawing === 'straightLine'
                ? 'bg-[#2962FF] text-white'
                : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
            }`}
          >
            <ArrowUpRight size={16} />
          </button>

          {/* Horizontal Line (Support/Resistance) */}
          <button
            onClick={() => handleSelectDrawing('horizontalStraightLine')}
            title="Horizontal Support / Resistance Level"
            className={`p-2 transition-colors ${
              activeDrawing === 'horizontalStraightLine'
                ? 'bg-[#089981] text-white'
                : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
            }`}
          >
            <Minus size={16} />
          </button>

          {/* Rectangle / Breakout Box */}
          <button
            onClick={() => handleSelectDrawing('rect')}
            title="Support / Resistance Box (Breakout Zone)"
            className={`p-2 transition-colors ${
              activeDrawing === 'rect'
                ? 'bg-[#A855F7] text-white'
                : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
            }`}
          >
            <Square size={16} />
          </button>

          {/* Parallel Channel */}
          <button
            onClick={() => handleSelectDrawing('parallelStraightLine')}
            title="Parallel Price Channel"
            className={`p-2 transition-colors ${
              activeDrawing === 'parallelStraightLine'
                ? 'bg-[#2962FF] text-white'
                : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
            }`}
          >
            <SplitSquareVertical size={16} />
          </button>

          {/* Fibonacci Retracement */}
          <button
            onClick={() => handleSelectDrawing('fibonacciLine')}
            title="Fibonacci Retracement"
            className={`p-2 transition-colors ${
              activeDrawing === 'fibonacciLine'
                ? 'bg-[#FF9800] text-white'
                : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
            }`}
          >
            <Layers size={16} />
          </button>

          {/* Text Annotation */}
          <button
            onClick={() => handleSelectDrawing('simpleAnnotation')}
            title="Text Annotation"
            className={`p-2 transition-colors ${
              activeDrawing === 'simpleAnnotation'
                ? 'bg-[#2962FF] text-white'
                : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
            }`}
          >
            <Type size={16} />
          </button>

          <div className="w-6 h-[1px] bg-[#1E222D] my-1" />

          {/* Lock / Unlock drawings */}
          <button
            onClick={() => setIsDrawingsLocked(!isDrawingsLocked)}
            title={isDrawingsLocked ? 'Unlock Drawings' : 'Lock Drawings'}
            className={`p-2 transition-colors ${
              isDrawingsLocked
                ? 'text-[#FF9800] bg-[#FF9800]/10'
                : 'text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D]'
            }`}
          >
            {isDrawingsLocked ? <Lock size={15} /> : <Unlock size={15} />}
          </button>

          {/* Hide / Show drawings */}
          <button
            onClick={() => setIsDrawingsVisible(!isDrawingsVisible)}
            title={isDrawingsVisible ? 'Hide Drawings' : 'Show Drawings'}
            className="p-2 text-[#787B86] hover:text-[#D1D4DC] hover:bg-[#1E222D] transition-colors"
          >
            {isDrawingsVisible ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>

          {/* Clear All Drawings */}
          <button
            onClick={handleClearDrawings}
            title="Clear All Drawings"
            className="p-2 text-[#787B86] hover:text-[#F23645] hover:bg-[#F23645]/10 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </aside>

        {/* ─────────────────────────────────────────────────────────────
            4. KLINECHARTS CANVAS & FLOATING QUICK-TOOLS
        ───────────────────────────────────────────────────────────── */}
        <div className="flex-1 w-full h-full relative">
          <div ref={chartRef} className="w-full h-full" />

          {/* Floating TradingView-Style Quick Toolbar */}
          <div className="absolute top-3 left-6 flex items-center bg-[#1E222D]/90 backdrop-blur-md border border-[#2A2E39] shadow-xl px-2 py-1 gap-1.5 z-10">
            <span className="text-[10px] text-[#787B86] font-mono select-none px-1 border-r border-[#2A2E39]">
              TOOLS
            </span>
            <button
              onClick={() => handleSelectDrawing('segment')}
              title="Trend Line"
              className={`p-1 hover:text-[#2962FF] transition-colors ${
                activeDrawing === 'segment' ? 'text-[#2962FF]' : 'text-[#787B86]'
              }`}
            >
              <TrendingUp size={14} />
            </button>
            <button
              onClick={() => handleSelectDrawing('rect')}
              title="Support/Resistance Breakout Box"
              className={`p-1 hover:text-[#A855F7] transition-colors ${
                activeDrawing === 'rect' ? 'text-[#A855F7]' : 'text-[#787B86]'
              }`}
            >
              <Square size={14} />
            </button>
            <button
              onClick={() => handleSelectDrawing('horizontalStraightLine')}
              title="Horizontal Support/Resistance"
              className={`p-1 hover:text-[#089981] transition-colors ${
                activeDrawing === 'horizontalStraightLine' ? 'text-[#089981]' : 'text-[#787B86]'
              }`}
            >
              <Minus size={14} />
            </button>
            <button
              onClick={() => handleSelectDrawing('fibonacciLine')}
              title="Fibonacci Retracement"
              className={`p-1 hover:text-[#FF9800] transition-colors ${
                activeDrawing === 'fibonacciLine' ? 'text-[#FF9800]' : 'text-[#787B86]'
              }`}
            >
              <Layers size={14} />
            </button>
            <button
              onClick={handleAutoSupportResistance}
              title="Auto S/R Detection"
              className="p-1 text-[#A855F7] hover:scale-110 transition-transform"
            >
              <Sparkles size={14} />
            </button>
            <div className="w-[1px] h-3 bg-[#2A2E39]" />
            <button
              onClick={handleClearDrawings}
              title="Clear"
              className="p-1 text-[#787B86] hover:text-[#F23645] transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* Active Drawing Notification Pill */}
          {activeDrawing !== 'cursor' && (
            <div className="absolute bottom-4 left-4 px-3 py-1.5 bg-[#1E222D]/95 border border-[#2962FF] text-[#2962FF] text-xs font-mono flex items-center gap-2 shadow-2xl backdrop-blur-md z-10">
              <span className="w-2 h-2 rounded-full bg-[#2962FF] animate-pulse" />
              <span>DRAWING: {activeDrawing.toUpperCase()} (Click & drag on chart)</span>
              <button
                onClick={() => setActiveDrawing('cursor')}
                className="ml-2 text-[#787B86] hover:text-white"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
