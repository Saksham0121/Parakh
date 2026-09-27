import { useEffect, useRef, useState } from 'react';
import {
  init,
  dispose,
  registerOverlay,
  Chart as KLineChart,
  KLineData,
  OverlayCreate,
  OverlayMode,
  LineType,
  PolygonType,
  TooltipShowRule,
} from 'klinecharts';

// Register custom Rectangle / Box drawing overlay (TradingView style zone / box)
registerOverlay({
  name: 'rect',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  styles: {
    polygon: {
      style: PolygonType.StrokeFill,
      color: 'rgba(168, 85, 247, 0.22)',
      borderColor: '#A855F7',
      borderSize: 2,
    },
  },
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length === 2) {
      const p1 = coordinates[0];
      const p2 = coordinates[1];
      return [
        {
          type: 'polygon',
          attrs: {
            coordinates: [
              { x: p1.x, y: p1.y },
              { x: p2.x, y: p1.y },
              { x: p2.x, y: p2.y },
              { x: p1.x, y: p2.y },
            ],
          },
          styles: {
            style: PolygonType.StrokeFill,
            color: overlay.styles?.polygon?.color ?? 'rgba(168, 85, 247, 0.22)',
            borderColor: overlay.styles?.polygon?.borderColor ?? '#A855F7',
            borderSize: overlay.styles?.polygon?.borderSize ?? 2,
          },
        },
      ];
    }
    return [];
  },
});
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
  Search,
  Plus,
  RefreshCw,
  LineChart,
  GripVertical,
  X,
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

// Map each drawing tool to its klinecharts overlay name
const TOOL_OVERLAY_MAP: Record<Exclude<DrawingTool, 'cursor'>, string> = {
  segment: 'segment',
  straightLine: 'straightLine',
  rayLine: 'rayLine',
  horizontalStraightLine: 'horizontalStraightLine',
  priceLine: 'priceLine',
  rect: 'rect',
  parallelStraightLine: 'parallelStraightLine',
  fibonacciLine: 'fibonacciLine',
  simpleAnnotation: 'simpleAnnotation',
};

interface TimeframeCategory {
  group: string;
  items: Array<{ label: string; value: string; desc: string }>;
}

const TIMEFRAMES: TimeframeCategory[] = [
  {
    group: 'Minutes',
    items: [
      { label: '1m', value: '1', desc: '1 Minute' },
      { label: '5m', value: '5', desc: '5 Minutes' },
      { label: '15m', value: '15', desc: '15 Minutes' },
      { label: '30m', value: '30', desc: '30 Minutes' },
    ],
  },
  {
    group: 'Hours',
    items: [{ label: '1h', value: '60', desc: '1 Hour' }],
  },
  {
    group: 'Days & Weeks',
    items: [
      { label: '1D', value: 'D', desc: '1 Day' },
      { label: '1W', value: 'W', desc: '1 Week' },
      { label: '1M', value: 'M', desc: '1 Month' },
    ],
  },
];

const INDICATOR_LIST = [
  { id: 'MA', name: 'Moving Average (MA)', subPane: false, color: '#FF9800', desc: 'Trend following simple moving average' },
  { id: 'EMA', name: 'Exponential Moving Avg (EMA)', subPane: false, color: '#29B6F6', desc: 'Weighted moving average for momentum' },
  { id: 'BOLL', name: 'Bollinger Bands (BOLL)', subPane: false, color: '#AB47BC', desc: 'Volatility bands with 2 standard deviations' },
  { id: 'VOL', name: 'Volume (VOL)', subPane: true, color: '#00E676', desc: 'Trading volume histogram sub-pane' },
  { id: 'RSI', name: 'Relative Strength Index (RSI)', subPane: true, color: '#26A69A', desc: 'Overbought / Oversold 0-100 oscillator' },
  { id: 'MACD', name: 'Moving Avg Convergence (MACD)', subPane: true, color: '#EC407A', desc: 'Momentum indicator with signal & histogram' },
  { id: 'KDJ', name: 'KDJ Stochastic Oscillator', subPane: true, color: '#FFD54F', desc: 'Fast/Slow stochastic price oscillator' },
];

const isSameCandlePeriod = (firstTimestamp: number, secondTimestamp: number, resolution: string) => {
  const first = new Date(firstTimestamp);
  const second = new Date(secondTimestamp);
  if (resolution === 'M') {
    return first.getUTCFullYear() === second.getUTCFullYear() && first.getUTCMonth() === second.getUTCMonth();
  }
  if (resolution === 'W') {
    const weekStart = (date: Date) => {
      const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
      copy.setUTCDate(copy.getUTCDate() - ((copy.getUTCDay() + 6) % 7));
      return copy.getTime();
    };
    return weekStart(first) === weekStart(second);
  }
  if (resolution === 'D') {
    return first.getUTCFullYear() === second.getUTCFullYear()
      && first.getUTCMonth() === second.getUTCMonth()
      && first.getUTCDate() === second.getUTCDate();
  }
  const seconds = Number(resolution) * 60;
  return Math.floor(firstTimestamp / (seconds * 1000)) === Math.floor(secondTimestamp / (seconds * 1000));
};

const getCandleStart = (timestamp: number, resolution: string) => {
  const seconds = Number(resolution) * 60;
  if (!Number.isFinite(seconds) || seconds <= 0) return timestamp;
  return Math.floor(timestamp / (seconds * 1000)) * seconds * 1000;
};

const BASE_CHART_STYLES = {
  grid: {
    horizontal: { color: '#141823', size: 1 },
    vertical: { color: '#141823', size: 1 },
  },
  candle: {
    tooltip: { showRule: TooltipShowRule.None },
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
        { offset: 1, color: 'rgba(41, 98, 255, 0.01)' },
      ],
    },
  },
  indicator: {
    tooltip: { showRule: TooltipShowRule.None },
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
    point: {
      color: '#2962FF',
      borderColor: '#FFFFFF',
      borderSize: 2,
      radius: 5,
      activeColor: '#00E676',
      activeBorderColor: '#FFFFFF',
      activeBorderSize: 2,
      activeRadius: 7,
    },
    line: { color: '#2962FF', size: 2 },
    polygon: {
      style: PolygonType.StrokeFill,
      color: 'rgba(168, 85, 247, 0.22)',
      borderColor: '#A855F7',
      borderSize: 2,
    },
  },
  yAxis: {
    axisLine: { color: '#1E222D', size: 1 },
    tickText: { color: '#787B86', family: "'JetBrains Mono', monospace", size: 11 },
  },
  xAxis: {
    axisLine: { color: '#1E222D', size: 1 },
    tickText: { color: '#787B86', family: "'JetBrains Mono', monospace", size: 11 },
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
};

export default function Chart({ symbol }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartCanvasAreaRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<KLineChart | null>(null);
  const liveCandleRef = useRef<KLineData | null>(null);
  const activeIndicatorsRef = useRef<string[]>(['VOL', 'MA']);
  const autoOverlayIdsRef = useRef<string[]>([]);

  // States
  const [activeDrawing, setActiveDrawing] = useState<DrawingTool>('cursor');
  const [resolution, setResolution] = useState<string>('D');
  const [activeIndicators, setActiveIndicators] = useState<string[]>(['VOL', 'MA']);
  const [chartType, setChartType] = useState<'candle_solid' | 'area' | 'line'>('candle_solid');

  // Draggable Favorite Tools Palette Position & State
  const [palettePos, setPalettePos] = useState<{ x: number; y: number }>({ x: 28, y: 24 });
  const [isDraggingPalette, setIsDraggingPalette] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

  // Single state for mutually-exclusive dropdowns (null = all closed)
  const [openDropdown, setOpenDropdown] = useState<'timeframe' | 'indicators' | 'style' | null>(null);
  const toggleDropdown = (name: 'timeframe' | 'indicators' | 'style') =>
    setOpenDropdown((prev) => (prev === name ? null : name));
  const isTimeframeOpen = openDropdown === 'timeframe';
  const isIndicatorsOpen = openDropdown === 'indicators';
  const isStyleOpen = openDropdown === 'style';
  const [indicatorSearch, setIndicatorSearch] = useState('');
  const [annotationText, setAnnotationText] = useState('');
  const [isAnnotationComposerOpen, setIsAnnotationComposerOpen] = useState(false);

  // Drawing modifiers
  const [isDrawingsLocked, setIsDrawingsLocked] = useState(false);
  const [isDrawingsVisible, setIsDrawingsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [chartMessage, setChartMessage] = useState<string | null>(null);
  const [levelToast, setLevelToast] = useState<{ type: 'BUY' | 'SELL'; price: number } | null>(null);
  // Track whether we're actively in drawing mode (waiting for user to place points)
  const [isInDrawingMode, setIsInDrawingMode] = useState(false);
  const activeOverlayIdRef = useRef<string | null>(null);

  // Track currently selected drawing overlay for independent editing/deletion
  const [selectedOverlay, setSelectedOverlay] = useState<{ id: string; name: string } | null>(null);

  // Hovered / Live OHLC legend data
  const [ohlc, setOhlc] = useState<{
    open?: number;
    high?: number;
    low?: number;
    close?: number;
    change?: number;
    changePct?: number;
  }>({});

  // Real-time live price from store
  const livePrice = useSocketStore((state) => state.prices[symbol]);

  const cleanSymbol = symbol.replace(/^BINANCE:/i, '').replace(/USDT$/i, '');
  const isIndian = symbol.endsWith('.NS') || symbol.endsWith('.BO');
  const exchange = symbol.startsWith('BINANCE:') ? 'CRYPTO' : (symbol.endsWith('.NS') ? 'NSE' : symbol.endsWith('.BO') ? 'BSE' : 'NASDAQ');
  const currencySymbol = isIndian ? '₹' : '$';

  // Draggable Toolbar Event Listeners
  useEffect(() => {
    if (!isDraggingPalette) return;

    // Shared logic for mouse and touch — just pass the client coords
    const movePalette = (clientX: number, clientY: number) => {
      if (!dragStartRef.current || !chartCanvasAreaRef.current) return;
      const bounds = chartCanvasAreaRef.current.getBoundingClientRect();
      const newX = Math.min(
        Math.max(8, dragStartRef.current.initX + clientX - dragStartRef.current.startX),
        Math.max(0, bounds.width - 430)
      );
      const newY = Math.min(
        Math.max(8, dragStartRef.current.initY + clientY - dragStartRef.current.startY),
        Math.max(0, bounds.height - 65)
      );
      setPalettePos({ x: newX, y: newY });
    };

    const handleMouseMove = (e: MouseEvent) => movePalette(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) movePalette(e.touches[0].clientX, e.touches[0].clientY);
    };
    const handleMouseUp = () => { setIsDraggingPalette(false); dragStartRef.current = null; };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDraggingPalette]);

  // Escape key cancels active drawing mode or deselects
  // Delete / Backspace keys remove the currently selected overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'Escape') {
        if (isAnnotationComposerOpen) {
          setIsAnnotationComposerOpen(false);
        } else if (isInDrawingMode) {
          exitDrawingMode();
        } else if (selectedOverlay) {
          setSelectedOverlay(null);
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedOverlay && chartInstance.current) {
        chartInstance.current.removeOverlay({ id: selectedOverlay.id });
        setSelectedOverlay(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnnotationComposerOpen, isInDrawingMode, selectedOverlay]);

  const handlePaletteMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingPalette(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: palettePos.x,
      initY: palettePos.y,
    };
  };

  const handlePaletteTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDraggingPalette(true);
      dragStartRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        initX: palettePos.x,
        initY: palettePos.y,
      };
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.dropdown-scope')) {
        setOpenDropdown(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initialize and load historical data
  useEffect(() => {
    if (!chartRef.current || !symbol) return;
    const chartElement = chartRef.current;
    let cancelled = false;

    // Clean up any existing chart instance / DOM nodes before re-init
    try {
      dispose(chartElement);
    } catch (_) { }
    chartElement.innerHTML = '';

    setIsLoading(true);
    setChartMessage(null);
    liveCandleRef.current = null;

    const chart = init(chartElement, {
      styles: {
        ...BASE_CHART_STYLES,
        candle: {
          ...BASE_CHART_STYLES.candle,
          type: chartType as any,
        },
      },
    });

    chartInstance.current = chart;

    // Restore the operator's chosen indicators when a symbol or timeframe reloads.
    activeIndicatorsRef.current.forEach((indicatorId) => {
      const definition = INDICATOR_LIST.find((item) => item.id === indicatorId);
      if (!definition) return;
      chart?.createIndicator(
        indicatorId,
        false,
        definition.subPane ? { id: `pane_${indicatorId.toLowerCase()}`, height: 90 } : { id: 'candle_pane' },
      );
    });

    // Track crosshair hover for live OHLC legend
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
        const res = await api.getCandles(symbol, resolution);
        if (res && res.t && res.t.length > 0) {
          const kLineData = res.t.map((timestamp: number, i: number) => ({
            timestamp: timestamp * 1000,
            open: res.o[i],
            high: res.h[i],
            low: res.l[i],
            close: res.c[i],
            volume: res.v[i],
          }));

          if (cancelled) return;
          chart?.applyNewData(kLineData);

          const lastIndex = kLineData.length - 1;
          const latest = kLineData[lastIndex];
          liveCandleRef.current = latest;
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
        } else if (!cancelled) {
          setChartMessage(`No chart data is currently available for ${cleanSymbol}. Try another timeframe or symbol.`);
        }
      } catch (err) {
        console.error('Failed to load historical data', err);
        if (!cancelled) setChartMessage('Could not load chart data. Check the market data service and try again.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchHistory();

    const handleResize = () => chart?.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', handleResize);
      try {
        dispose(chartElement);
        chartElement.innerHTML = '';
      } catch (_) { }
      chartInstance.current = null;
      liveCandleRef.current = null;
    };
  }, [symbol, resolution, cleanSymbol, reloadNonce]);

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
      const tickTimestamp = livePrice.timestamp * 1000;
      const previous = liveCandleRef.current;
      const continuingCandle = previous && isSameCandlePeriod(previous.timestamp, tickTimestamp, resolution);
      const candle: KLineData = continuingCandle
        ? {
            ...previous,
            high: Math.max(previous.high, livePrice.price),
            low: Math.min(previous.low, livePrice.price),
            close: livePrice.price,
            volume: livePrice.volume ?? previous.volume,
          }
        : {
            timestamp: getCandleStart(tickTimestamp, resolution),
            open: previous?.close ?? livePrice.price,
            high: livePrice.price,
            low: livePrice.price,
            close: livePrice.price,
            volume: livePrice.volume ?? 0,
          };
      chartInstance.current.updateData(candle);
      liveCandleRef.current = candle;
    }
  }, [livePrice, resolution]);

  // Sync lock and visibility state with chart overlays
  useEffect(() => {
    if (chartInstance.current) {
      try {
        chartInstance.current.overrideOverlay({
          lock: isDrawingsLocked,
          visible: isDrawingsVisible,
        });
      } catch (_) { }
    }
  }, [isDrawingsLocked, isDrawingsVisible]);

  // ─── TradingView-style drawing mode ────────────────────────────────────────
  //
  // How it works (mirrors TradingView UX):
  //   1. Click a tool button  → enters "drawing mode", cursor changes to crosshair
  //   2. Click on chart       → places the first anchor point
  //   3. Move mouse           → live preview of the shape follows cursor
  //   4. Click again          → places second point / finalises the shape
  //   5. After finishing      → auto-reverts to cursor (same as TV)
  //   6. Escape key           → cancels and removes the in-progress overlay
  //
  // klinecharts handles all the point-placement natively once we call
  // createOverlay().  We subscribe to 'onOverlayRemoved' to detect when
  // the user completes (or cancels) a drawing so we can revert the tool.
  // ────────────────────────────────────────────────────────────────────────────

  const exitDrawingMode = () => {
    setActiveDrawing('cursor');
    setIsInDrawingMode(false);
    // Remove any in-progress (incomplete) overlay
    if (activeOverlayIdRef.current && chartInstance.current) {
      try {
        chartInstance.current.removeOverlay({ id: activeOverlayIdRef.current });
      } catch (_) { }
    }
    activeOverlayIdRef.current = null;
  };

  const handleSelectDrawing = (tool: DrawingTool, annotation?: string) => {
    // An annotation needs text before it becomes a chart object. Opening a composer
    // avoids the empty labels produced by the chart library's default annotation.
    if (tool === 'simpleAnnotation' && annotation === undefined) {
      exitDrawingMode();
      setIsAnnotationComposerOpen(true);
      return;
    }
    // Clicking cursor always exits drawing mode
    if (tool === 'cursor') {
      exitDrawingMode();
      return;
    }

    // If already in drawing mode with the same tool, cancel (toggle off)
    if (tool === activeDrawing && isInDrawingMode) {
      exitDrawingMode();
      return;
    }

    // Cancel any previous in-progress overlay before starting a new one
    if (activeOverlayIdRef.current && chartInstance.current) {
      try {
        chartInstance.current.removeOverlay({ id: activeOverlayIdRef.current });
      } catch (_) { }
      activeOverlayIdRef.current = null;
    }

    if (!chartInstance.current) return;

    setActiveDrawing(tool);
    setIsInDrawingMode(true);

    const overlayName = TOOL_OVERLAY_MAP[tool];

    // Build per-tool style
    const lineStyle =
      tool === 'horizontalStraightLine' || tool === 'priceLine'
        ? { color: '#089981', size: 2, style: LineType.Dashed, dashedValue: [4, 4] as [number, number] }
        : tool === 'fibonacciLine'
        ? { color: '#FF9800', size: 2 }
        : { color: '#2962FF', size: 2 };

    const rectStyle =
      tool === 'rect'
        ? {
            polygon: {
              style: PolygonType.StrokeFill,
              color: 'rgba(168, 85, 247, 0.22)',
              borderColor: '#A855F7',
              borderSize: 2,
            },
          }
        : {};

    const overlayConfig: OverlayCreate = {
      name: overlayName,
      ...(tool === 'simpleAnnotation' ? { extendData: annotation?.trim() || 'Note' } : {}),
      lock: isDrawingsLocked,
      mode: OverlayMode.Normal,
      styles: {
        point: {
          color: '#2962FF',
          borderColor: '#FFFFFF',
          borderSize: 2,
          radius: 5,
          activeColor: '#00E676',
          activeBorderColor: '#FFFFFF',
          activeBorderSize: 2,
          activeRadius: 7,
        },
        line: lineStyle,
        ...rectStyle,
      },
      // When user clicks to select this shape
      onSelected: (event) => {
        if (event.overlay) {
          setSelectedOverlay({ id: event.overlay.id, name: event.overlay.name || overlayName });
        }
        return true;
      },
      // When user clicks outside or deselects this shape
      onDeselected: () => {
        setSelectedOverlay(null);
        return true;
      },
      // Right-click instantly deletes this specific shape
      onRightClick: (event) => {
        if (event.overlay && chartInstance.current) {
          chartInstance.current.removeOverlay({ id: event.overlay.id });
          setSelectedOverlay(null);
        }
        return true;
      },
      // ↓ klinecharts calls this once the user finishes placing all required points
      onDrawEnd: (event) => {
        // Drawing complete — select the newly placed shape & revert tool to cursor
        if (event.overlay) {
          setSelectedOverlay({ id: event.overlay.id, name: event.overlay.name || overlayName });
        }
        setActiveDrawing('cursor');
        setIsInDrawingMode(false);
        activeOverlayIdRef.current = null;
        return true;
      },
      // ↓ Called when overlay is removed
      onRemoved: (event) => {
        if (activeOverlayIdRef.current === event.overlay?.id) {
          activeOverlayIdRef.current = null;
          setActiveDrawing('cursor');
          setIsInDrawingMode(false);
        }
        setSelectedOverlay((prev) => (prev?.id === event.overlay?.id ? null : prev));
        return true;
      },
    };

    const overlayId = chartInstance.current.createOverlay(overlayConfig);
    // createOverlay returns the id string (or array) — store it for cancellation
    if (typeof overlayId === 'string') {
      activeOverlayIdRef.current = overlayId;
    } else if (Array.isArray(overlayId) && overlayId.length > 0) {
      activeOverlayIdRef.current = overlayId[0];
    }
  };

  // Delete only the currently selected overlay
  const handleDeleteSelectedOverlay = () => {
    if (selectedOverlay && chartInstance.current) {
      chartInstance.current.removeOverlay({ id: selectedOverlay.id });
      setSelectedOverlay(null);
    }
  };

  // Clear all drawings
  const handleClearDrawings = () => {
    if (chartInstance.current) {
      chartInstance.current.removeOverlay();
      autoOverlayIdsRef.current = [];
      setActiveDrawing('cursor');
      setIsInDrawingMode(false);
      setSelectedOverlay(null);
    }
  };

  // Toggle Indicator
  const toggleIndicator = (id: string, isSubPane: boolean) => {
    if (!chartInstance.current) return;
    const exists = activeIndicators.includes(id);

    if (exists) {
      chartInstance.current.removeIndicator(isSubPane ? `pane_${id.toLowerCase()}` : 'candle_pane', id);
      const next = activeIndicators.filter((item) => item !== id);
      activeIndicatorsRef.current = next;
      setActiveIndicators(next);
    } else {
      if (isSubPane) {
        chartInstance.current.createIndicator(id, false, { id: `pane_${id.toLowerCase()}`, height: 90 });
      } else {
        chartInstance.current.createIndicator(id, false, { id: 'candle_pane' });
      }
      const next = [...activeIndicators, id];
      activeIndicatorsRef.current = next;
      setActiveIndicators(next);
    }
  };

  // Auto Support/Resistance & Breakout detection
  const handleAutoSupportResistance = async () => {
    if (!chartInstance.current) return;
    try {
      setChartMessage(null);
      const data = await api.getCandles(symbol, resolution);
      if (!data || !data.c || data.c.length < 20) {
        setChartMessage('Auto S/R needs at least 20 completed candles for this symbol and timeframe.');
        return;
      }

      // Replace the previous generated levels instead of piling duplicate analysis on the chart.
      for (const id of autoOverlayIdsRef.current) {
        chartInstance.current.removeOverlay({ id });
      }
      autoOverlayIdsRef.current = [];

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

      // Common callbacks for Auto S/R shapes
      const autoSRCallbacks = {
        onSelected: (event: any) => {
          if (event.overlay) {
            setSelectedOverlay({ id: event.overlay.id, name: event.overlay.name });
          }
          return true;
        },
        onDeselected: () => {
          setSelectedOverlay(null);
          return true;
        },
        onRightClick: (event: any) => {
          if (event.overlay && chartInstance.current) {
            chartInstance.current.removeOverlay({ id: event.overlay.id });
            setSelectedOverlay(null);
          }
          return true;
        },
      };

      // Resistance Level
      const resistanceId = chartInstance.current.createOverlay({
        name: 'horizontalStraightLine',
        points: [{ timestamp: data.t[data.t.length - 1] * 1000, value: highest }],
        styles: {
          line: { color: '#F23645', size: 2, style: LineType.Dashed, dashedValue: [6, 4] },
        },
        ...autoSRCallbacks,
      });
      if (typeof resistanceId === 'string') autoOverlayIdsRef.current.push(resistanceId);

      // Support Level
      const supportId = chartInstance.current.createOverlay({
        name: 'horizontalStraightLine',
        points: [{ timestamp: data.t[data.t.length - 1] * 1000, value: lowest }],
        styles: {
          line: { color: '#089981', size: 2, style: LineType.Dashed, dashedValue: [6, 4] },
        },
        ...autoSRCallbacks,
      });
      if (typeof supportId === 'string') autoOverlayIdsRef.current.push(supportId);

      // Consolidation Breakout Box
      const boxStartTs = data.t[Math.max(0, data.t.length - 20)] * 1000;
      const boxEndTs = data.t[data.t.length - 1] * 1000;
      const boxHigh = Math.max(...highs.slice(-20));
      const boxLow = Math.min(...lows.slice(-20));

      const boxId = chartInstance.current.createOverlay({
        name: 'rect',
        points: [
          { timestamp: boxStartTs, value: boxHigh },
          { timestamp: boxEndTs, value: boxLow },
        ],
        styles: {
          polygon: {
            style: PolygonType.StrokeFill,
            color: 'rgba(168, 85, 247, 0.22)',
            borderColor: '#A855F7',
            borderSize: 2,
          },
        },
        ...autoSRCallbacks,
      });
      if (typeof boxId === 'string') autoOverlayIdsRef.current.push(boxId);
    } catch (err) {
      console.error('Auto S/R calculation error', err);
      setChartMessage('Auto S/R could not analyze this market. Try again once candle data is available.');
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

  // This is an analysis platform, not a broker: these controls mark actionable levels,
  // rather than implying that an order was sent or filled.
  const handleQuickLevel = (type: 'BUY' | 'SELL') => {
    const price = ohlc.close || livePrice?.price || 310;
    const levelPrice = type === 'BUY' ? price * 1.0005 : price * 0.9995;
    if (chartInstance.current) {
      const id = chartInstance.current.createOverlay({
        name: 'priceLine',
        points: [{ timestamp: Date.now(), value: levelPrice }],
        styles: { line: { color: type === 'BUY' ? '#089981' : '#F23645', size: 2, style: LineType.Dashed, dashedValue: [5, 4] } },
      });
      if (typeof id === 'string') setSelectedOverlay({ id, name: `${type.toLowerCase()} level` });
    }
    setLevelToast({ type, price: levelPrice });
    window.setTimeout(() => setLevelToast(null), 3000);
  };

  const isUp = (ohlc.change ?? 0) >= 0;

  const filteredIndicators = INDICATOR_LIST.filter(
    (ind) =>
      ind.name.toLowerCase().includes(indicatorSearch.toLowerCase()) ||
      ind.id.toLowerCase().includes(indicatorSearch.toLowerCase())
  );

  return (
    <div
      ref={chartContainerRef}
      className="relative w-full h-full flex flex-col bg-[#0B0E14] text-[#D1D4DC] select-none font-sans"
    >
      {/* ─────────────────────────────────────────────────────────────
          1. TRADINGVIEW TOP NAVBAR (CANDLES, TIMEFRAME, INDICATORS)
          GENEROUS LEFT MARGIN (pl-6) FOR SPACED-OUT LAYOUT
      ───────────────────────────────────────────────────────────── */}
      <header className="relative z-50 !h-12 bg-[#10141E] border-b border-[#1A2230] flex items-center justify-between !px-3 sm:!px-4 gap-3 text-xs overflow-visible">
        {/* Left Section: Symbol, Timeframe dropdown, Chart Style, Indicators */}
        <div className="flex items-center gap-2 h-full overflow-visible">
          {/* Symbol & Exchange Badge */}
          <div className="flex items-center gap-2 !h-8 !px-2.5 !py-1 bg-[#161B26] hover:bg-[#1E2536] transition-colors rounded-md cursor-default border border-[#242C3D] !mr-1 shadow-sm whitespace-nowrap">
            <span className="font-bold text-[#F0F4F8] tracking-wide text-xs">{cleanSymbol}</span>
            <span className="text-[9px] !px-1.5 !py-0.2 bg-[#242C3D] text-[#787B86] font-mono rounded uppercase font-semibold">
              {exchange}
            </span>
          </div>
          <div className="w-[1px] h-4 bg-[#1E2536] mx-0.5" />

          {/* Quick Timeframes */}
          <div className="flex items-center gap-0.5 dropdown-scope relative">
            {['15', '60', 'D'].map((tf) => (
              <button
                key={tf}
                onClick={() => setResolution(tf)}
                className={`!h-8 !px-2.5 !py-1 flex items-center justify-center rounded-md transition-all font-medium whitespace-nowrap text-xs ${resolution === tf
                    ? 'text-[#2962FF] font-bold bg-[#2962FF]/15 border border-[#2962FF]/40 shadow-sm'
                    : 'text-[#787B86] hover:text-[#F0F4F8] hover:bg-[#161B26]'
                  }`}
              >
                {tf === '15' ? '15m' : tf === '60' ? '1h' : '1D'}
              </button>
            ))}

            {/* Timeframe Dropdown */}
            <div className={`relative ${isTimeframeOpen ? 'z-50' : ''}`}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDropdown('timeframe');
                }}
                className={`!h-8 !px-1.5 !py-1 rounded-md text-[#787B86] hover:text-[#F0F4F8] hover:bg-[#161B26] flex items-center justify-center transition-colors ${isTimeframeOpen ? 'bg-[#161B26] text-[#2962FF]' : ''
                  }`}
              >
                <ChevronDown size={13} />
              </button>

              {isTimeframeOpen && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute top-9 left-0 !w-44 bg-[#121721] border border-[#242C3D] shadow-2xl !rounded-lg !p-1 z-50 animate-dropdown backdrop-blur-xl"
                >
                  {TIMEFRAMES.map((group) => (
                    <div key={group.group} className="border-b border-[#1E2536] last:border-0 !py-1">
                      <div className="!px-2.5 !py-0.5 text-[9px] uppercase tracking-wider text-[#787B86] font-semibold font-mono">
                        {group.group}
                      </div>
                      {group.items.map((item) => (
                        <div
                          key={item.value}
                          onClick={() => {
                            setResolution(item.value);
                            setOpenDropdown(null);
                          }}
                          className={`!px-2.5 !py-1.5 text-xs cursor-pointer flex items-center justify-between hover:bg-[#1A2230] transition-colors !rounded-md !my-0.5 ${resolution === item.value ? 'text-[#2962FF] font-bold bg-[#2962FF]/15' : 'text-[#D1D4DC]'
                            }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{item.label}</span>
                          </div>
                          {resolution === item.value && <Check size={13} className="text-[#2962FF] flex-shrink-0" />}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="w-[1px] h-4 bg-[#1E2536] mx-0.5" />

          {/* Chart Style Dropdown */}
          <div className={`relative dropdown-scope ${isStyleOpen ? 'z-50' : ''}`}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleDropdown('style');
              }}
              className={`flex items-center gap-1.5 !h-8 !px-2.5 !py-1 rounded-md text-[#D1D4DC] hover:bg-[#161B26] transition-colors border border-transparent hover:border-[#242C3D] whitespace-nowrap text-xs ${isStyleOpen ? 'bg-[#161B26] border-[#242C3D]' : ''
                }`}
            >
              <BarChart2 size={15} className="text-[#2962FF]" />
              <span className="capitalize font-medium">{chartType === 'candle_solid' ? 'Candles' : chartType}</span>
              <ChevronDown size={12} className="text-[#787B86]" />
            </button>

            {isStyleOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute top-9 left-0 !w-38 bg-[#121721] border border-[#242C3D] shadow-2xl !rounded-lg !p-1.5 z-50 animate-dropdown backdrop-blur-xl"
              >
                {[
                  { label: 'Candles', value: 'candle_solid', icon: BarChart2 },
                  { label: 'Line', value: 'line', icon: LineChart },
                  { label: 'Area', value: 'area', icon: Activity },
                ].map((st) => (
                  <div
                    key={st.value}
                    onClick={() => {
                      setChartType(st.value as any);
                      setOpenDropdown(null);
                    }}
                    className={`!px-2.5 !py-1.5 text-xs cursor-pointer flex items-center justify-between hover:bg-[#1A2230] transition-colors !rounded-md !my-0.5 ${chartType === st.value ? 'text-[#2962FF] font-bold bg-[#2962FF]/15' : 'text-[#D1D4DC]'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <st.icon size={14} className={chartType === st.value ? 'text-[#2962FF]' : 'text-[#787B86]'} />
                      <span className="font-medium">{st.label}</span>
                    </div>
                    {chartType === st.value && <Check size={13} className="text-[#2962FF] flex-shrink-0" />}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="w-[1px] h-4 bg-[#1E2536] mx-0.5" />

          {/* Indicators Dropdown */}
          <div className={`relative dropdown-scope ${isIndicatorsOpen ? 'z-50' : ''}`}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleDropdown('indicators');
              }}
              className={`flex items-center gap-1.5 !h-8 !px-2.5 !py-1 rounded-md text-[#D1D4DC] hover:bg-[#161B26] transition-colors border border-transparent hover:border-[#242C3D] whitespace-nowrap text-xs ${isIndicatorsOpen ? 'bg-[#161B26] border-[#242C3D]' : ''
                }`}
            >
              <Activity size={15} className="text-[#00E676]" />
              <span className="font-medium">Indicators</span>
              <span className="min-w-4.5 !h-4.5 !px-1 flex items-center justify-center text-[9px] bg-[#242C3D] text-[#D1D4DC] rounded-full font-mono font-bold leading-none">
                {activeIndicators.length}
              </span>
              <ChevronDown size={12} className="text-[#787B86]" />
            </button>

            {isIndicatorsOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute top-9 left-0 !w-[290px] max-w-[90vw] bg-[#121721] border border-[#242C3D] shadow-2xl !rounded-lg !p-2 z-50 animate-dropdown backdrop-blur-2xl"
              >
                {/* Search Bar inside indicator dropdown */}
                <div className="relative !mb-2">
                  <Search size={13} className="absolute left-2.5 top-2 text-[#787B86]" />
                  <input
                    type="text"
                    placeholder="Search indicators..."
                    value={indicatorSearch}
                    onChange={(e) => setIndicatorSearch(e.target.value)}
                    className="w-full !h-7.5 bg-[#1A2230] border border-[#242C3D] !rounded-md !pl-7.5 !pr-7 !py-1 text-xs text-[#F0F4F8] focus:border-[#2962FF]"
                    autoFocus
                  />
                  {indicatorSearch && (
                    <button
                      onClick={() => setIndicatorSearch('')}
                      className="absolute right-2 top-1.5 !p-0.5 text-[#787B86] hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="!max-h-60 overflow-y-auto !pr-1 !space-y-0.5">
                  {filteredIndicators.map((ind) => {
                    const isActive = activeIndicators.includes(ind.id);
                    return (
                      <div
                        key={ind.id}
                        onClick={() => toggleIndicator(ind.id, ind.subPane)}
                        className={`!px-2.5 !py-1.5 !rounded-md !my-0.5 cursor-pointer flex items-center justify-between hover:bg-[#1A2230] transition-colors ${isActive ? 'bg-[#2962FF]/15 text-[#F0F4F8]' : 'text-[#787B86]'
                          }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex flex-col">
                            <span className="font-medium text-xs text-[#F0F4F8]">{ind.name}</span>
                            <span className="text-[10px] text-[#787B86]">{ind.desc}</span>
                          </div>
                        </div>
                        {isActive ? (
                          <Check size={13} className="text-[#2962FF] flex-shrink-0" />
                        ) : (
                          <Plus size={13} className="text-[#787B86] hover:text-white flex-shrink-0" />
                        )}
                      </div>
                    );
                  })}
                  {filteredIndicators.length === 0 && (
                    <div className="!py-4 text-center text-xs text-[#787B86]">No indicators found.</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="w-[1px] h-4 bg-[#1E2536] mx-0.5" />

          {/* Auto Support & Resistance Button */}
          <button
            onClick={handleAutoSupportResistance}
            title="Auto-detect Breakouts and Key Support/Resistance Levels"
            className="flex items-center gap-1.5 !h-8 !px-2.5 !py-1 bg-gradient-to-r from-[#A855F7]/15 to-[#2962FF]/15 hover:from-[#A855F7]/25 hover:to-[#2962FF]/25 text-[#A855F7] border border-[#A855F7]/35 rounded-md transition-all text-xs font-bold tracking-wider shadow-sm hover:shadow-[#A855F7]/20 whitespace-nowrap"
          >
            <Sparkles size={13} className="text-[#A855F7] animate-pulse" />
            <span>AUTO S/R</span>
          </button>
        </div>

        {/* Right Section: Fullscreen & Status */}
        <div className="flex items-center gap-1.5">
          {isLoading && <RefreshCw size={12} className="text-[#2962FF] animate-spin" />}

          <button
            onClick={toggleFullscreen}
            title="Toggle Fullscreen"
            className="!h-8 !w-8 !p-1.5 flex items-center justify-center rounded-md text-[#787B86] hover:text-[#F0F4F8] hover:bg-[#161B26] transition-colors"
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          2. MAIN WORKSPACE: LEFT RAIL + (SUB-HEADER & CHART CANVAS)
      ───────────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 w-full h-full flex overflow-hidden">
        {/* Left Drawing Sidebar (ENLARGED ICONS & GENEROUS MARGINS) */}
        <aside className="w-16 bg-[#10141E] border-r border-[#1A2230] flex flex-col items-center !py-4 px-2 gap-2 z-20 shadow-md">
          {/* Pointer / Cursor */}
          <button
            onClick={() => handleSelectDrawing('cursor')}
            title="Crosshair / Select & Move (Drag shapes)"
            className={`w-11 h-11 flex items-center justify-center rounded-xl my-0.5 transition-all ${activeDrawing === 'cursor'
                ? 'bg-[#2962FF] text-white shadow-lg shadow-[#2962FF]/40'
                : 'text-[#787B86] hover:text-[#F0F4F8] hover:bg-[#1A2230]'
              }`}
          >
            <MousePointer2 size={22} />
          </button>

          <div className="w-8 h-[1px] bg-[#1E2536] my-1.5" />

          {/* Trend Line */}
          <button
            onClick={() => handleSelectDrawing('segment')}
            title="Trend Line (Diagonal Breakouts)"
            className={`w-11 h-11 flex items-center justify-center rounded-xl my-0.5 transition-all ${activeDrawing === 'segment'
                ? 'bg-[#2962FF] text-white shadow-lg shadow-[#2962FF]/40'
                : 'text-[#787B86] hover:text-[#F0F4F8] hover:bg-[#1A2230]'
              }`}
          >
            <TrendingUp size={22} />
          </button>

          {/* Extended Line */}
          <button
            onClick={() => handleSelectDrawing('straightLine')}
            title="Extended Trend Line"
            className={`w-11 h-11 flex items-center justify-center rounded-xl my-0.5 transition-all ${activeDrawing === 'straightLine'
                ? 'bg-[#2962FF] text-white shadow-lg shadow-[#2962FF]/40'
                : 'text-[#787B86] hover:text-[#F0F4F8] hover:bg-[#1A2230]'
              }`}
          >
            <ArrowUpRight size={22} />
          </button>

          {/* Horizontal Line (Support/Resistance) */}
          <button
            onClick={() => handleSelectDrawing('horizontalStraightLine')}
            title="Horizontal Support / Resistance Level"
            className={`w-11 h-11 flex items-center justify-center rounded-xl my-0.5 transition-all ${activeDrawing === 'horizontalStraightLine'
                ? 'bg-[#089981] text-white shadow-lg shadow-[#089981]/40'
                : 'text-[#787B86] hover:text-[#F0F4F8] hover:bg-[#1A2230]'
              }`}
          >
            <Minus size={22} />
          </button>

          {/* Rectangle / Breakout Box */}
          <button
            onClick={() => handleSelectDrawing('rect')}
            title="Support / Resistance Box (Breakout Zone)"
            className={`w-11 h-11 flex items-center justify-center rounded-xl my-0.5 transition-all ${activeDrawing === 'rect'
                ? 'bg-[#A855F7] text-white shadow-lg shadow-[#A855F7]/40'
                : 'text-[#787B86] hover:text-[#F0F4F8] hover:bg-[#1A2230]'
              }`}
          >
            <Square size={22} />
          </button>

          {/* Parallel Channel */}
          <button
            onClick={() => handleSelectDrawing('parallelStraightLine')}
            title="Parallel Price Channel"
            className={`w-11 h-11 flex items-center justify-center rounded-xl my-0.5 transition-all ${activeDrawing === 'parallelStraightLine'
                ? 'bg-[#2962FF] text-white shadow-lg shadow-[#2962FF]/40'
                : 'text-[#787B86] hover:text-[#F0F4F8] hover:bg-[#1A2230]'
              }`}
          >
            <SplitSquareVertical size={22} />
          </button>

          {/* Fibonacci Retracement */}
          <button
            onClick={() => handleSelectDrawing('fibonacciLine')}
            title="Fibonacci Retracement"
            className={`w-11 h-11 flex items-center justify-center rounded-xl my-0.5 transition-all ${activeDrawing === 'fibonacciLine'
                ? 'bg-[#FF9800] text-white shadow-lg shadow-[#FF9800]/40'
                : 'text-[#787B86] hover:text-[#F0F4F8] hover:bg-[#1A2230]'
              }`}
          >
            <Layers size={22} />
          </button>

          {/* Text Annotation */}
          <button
            onClick={() => handleSelectDrawing('simpleAnnotation')}
            title="Text Annotation"
            className={`w-11 h-11 flex items-center justify-center rounded-xl my-0.5 transition-all ${activeDrawing === 'simpleAnnotation'
                ? 'bg-[#2962FF] text-white shadow-lg shadow-[#2962FF]/40'
                : 'text-[#787B86] hover:text-[#F0F4F8] hover:bg-[#1A2230]'
              }`}
          >
            <Type size={22} />
          </button>

          <div className="w-8 h-[1px] bg-[#1E2536] my-1.5" />

          {/* Lock / Unlock drawings */}
          <button
            onClick={() => setIsDrawingsLocked(!isDrawingsLocked)}
            title={isDrawingsLocked ? 'Unlock Drawings' : 'Lock Drawings'}
            className={`w-11 h-11 flex items-center justify-center rounded-xl my-0.5 transition-all ${isDrawingsLocked ? 'text-[#FF9800] bg-[#FF9800]/15' : 'text-[#787B86] hover:text-[#F0F4F8] hover:bg-[#1A2230]'
              }`}
          >
            {isDrawingsLocked ? <Lock size={19} /> : <Unlock size={19} />}
          </button>

          {/* Hide / Show drawings */}
          <button
            onClick={() => setIsDrawingsVisible(!isDrawingsVisible)}
            title={isDrawingsVisible ? 'Hide Drawings' : 'Show Drawings'}
            className="w-11 h-11 flex items-center justify-center rounded-xl my-0.5 text-[#787B86] hover:text-[#F0F4F8] hover:bg-[#1A2230] transition-colors"
          >
            {isDrawingsVisible ? <Eye size={19} /> : <EyeOff size={19} />}
          </button>

          {/* Clear All Drawings */}
          <button
            onClick={handleClearDrawings}
            title="Clear All Drawings"
            className="w-11 h-11 flex items-center justify-center rounded-xl my-0.5 text-[#787B86] hover:text-[#F23645] hover:bg-[#F23645]/15 transition-colors"
          >
            <Trash2 size={19} />
          </button>
        </aside>

        {/* Right Section: Sub-header + Chart Canvas Column */}
        <div className="px-4 sm:px-7 flex-1 h-full flex flex-col min-w-0">
          {/* Stock Info Row (Sub-Header) with Generous Margin */}
          <div className="!h-11 sm:!h-12 bg-[#0E121B] border-b border-[#1A2230] flex items-center justify-between !px-3 sm:!px-4 !py-1.5 gap-3 text-xs font-mono z-20">
            {/* Symbol Title & Live OHLC stats with distinct badge padding */}
            <div className="flex items-center gap-2.5 overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-2 !h-8 !px-2.5 !py-1 bg-[#141923] border border-[#1E2536] rounded-md flex-shrink-0 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-[#089981] animate-pulse flex-shrink-0" />
                <span className="text-[#F0F4F8] font-bold tracking-wide">{cleanSymbol}</span>
                <span className="text-[#787B86] text-[10px] flex items-center gap-1">
                  <span>·</span>
                  <span>{resolution}</span>
                  <span>·</span>
                  <span>{exchange}</span>
                </span>
              </div>

              <div className="flex items-center gap-2.5 !h-8 !px-2.5 !py-1 bg-[#141923]/60 border border-[#1E2536] rounded-md text-xs flex-shrink-0">
                <span className="flex items-center gap-1"><span className="text-[#787B86] font-semibold text-[11px]">O</span> <strong className="text-[#F0F4F8] font-medium">{ohlc.open?.toFixed(2) ?? '—'}</strong></span>
                <span className="flex items-center gap-1"><span className="text-[#787B86] font-semibold text-[11px]">H</span> <strong className="text-[#F0F4F8] font-medium">{ohlc.high?.toFixed(2) ?? '—'}</strong></span>
                <span className="flex items-center gap-1"><span className="text-[#787B86] font-semibold text-[11px]">L</span> <strong className="text-[#F0F4F8] font-medium">{ohlc.low?.toFixed(2) ?? '—'}</strong></span>
                <span className="flex items-center gap-1"><span className="text-[#787B86] font-semibold text-[11px]">C</span> <strong className="text-[#F0F4F8] font-medium">{ohlc.close?.toFixed(2) ?? '—'}</strong></span>
                {ohlc.change != null && (
                  <span
                    className={`font-bold !px-2 !py-0.5 rounded text-[11px] tracking-tight flex items-center ${isUp ? 'text-[#089981] bg-[#089981]/15 border border-[#089981]/30' : 'text-[#F23645] bg-[#F23645]/15 border border-[#F23645]/30'
                      }`}
                  >
                    {isUp ? '+' : ''}
                    {ohlc.change.toFixed(2)} ({isUp ? '+' : ''}
                    {ohlc.changePct?.toFixed(2)}%)
                  </span>
                )}
              </div>
            </div>

            {/* Analysis levels — this terminal does not execute broker orders. */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => handleQuickLevel('SELL')}
                title="Mark a sell reference level on the chart"
                className="!h-8 !px-2.5 !py-1 flex items-center gap-1.5 bg-[#F23645]/15 hover:bg-[#F23645]/25 border border-[#F23645]/40 rounded-md text-xs font-mono transition-all whitespace-nowrap shadow-sm hover:shadow-[#F23645]/15"
              >
                <span className="text-[#F23645] font-bold text-xs">{currencySymbol}{((ohlc.close ?? 310) * 0.9995).toFixed(2)}</span>
                <span className="text-[#E0E3EB] text-[9px] font-bold tracking-wider">MARK SELL</span>
              </button>
              <button
                onClick={() => handleQuickLevel('BUY')}
                title="Mark a buy reference level on the chart"
                className="!h-8 !px-2.5 !py-1 flex items-center gap-1.5 bg-[#089981]/15 hover:bg-[#089981]/25 border border-[#089981]/40 rounded-md text-xs font-mono transition-all whitespace-nowrap shadow-sm hover:shadow-[#089981]/15"
              >
                <span className="text-[#089981] font-bold text-xs">{currencySymbol}{((ohlc.close ?? 310) * 1.0005).toFixed(2)}</span>
                <span className="text-[#E0E3EB] text-[9px] font-bold tracking-wider">MARK BUY</span>
              </button>
            </div>
          </div>

          {/* ─────────────────────────────────────────────────────────────
              3. KLINECHARTS CANVAS & MOVABLE DRAGGABLE FAVORITES PALETTE
          ───────────────────────────────────────────────────────────── */}
          <div ref={chartCanvasAreaRef} className="flex-1 w-full h-full relative overflow-hidden">
            <div ref={chartRef} className="w-full h-full" />

            {chartMessage && (
              <div className="absolute inset-0 z-30 grid place-items-center bg-[#0B0E14]/85 p-6 text-center backdrop-blur-[2px]">
                <div className="max-w-sm border border-[#242C3D] bg-[#121721] px-5 py-4 shadow-2xl">
                  <strong className="block text-sm text-[#F0F4F8]">Chart data unavailable</strong>
                  <p className="mt-2 text-xs leading-5 text-[#787B86]">{chartMessage}</p>
                  <button onClick={() => setReloadNonce((current) => current + 1)} className="mt-4 border border-[#2962FF]/50 bg-[#2962FF]/10 px-3 py-1.5 text-xs font-semibold text-[#8BA8FF] hover:bg-[#2962FF]/20">
                    Try again
                  </button>
                </div>
              </div>
            )}

            {/* 🎯 Draggable Favorites Toolbar (Movable across the chart area) */}
            <div
              style={{
                transform: `translate3d(${palettePos.x}px, ${palettePos.y}px, 0)`,
              }}
              className={`absolute top-0 left-0 flex items-center bg-[#121721]/95 backdrop-blur-md border border-[#242C3D] shadow-2xl !rounded-xl !px-4 !py-2.5 !gap-2.5 !m-1.5 z-20 transition-shadow ${isDraggingPalette
                  ? 'shadow-2xl shadow-[#2962FF]/20 border-[#2962FF] cursor-grabbing ring-1 ring-[#2962FF]/50'
                  : 'cursor-default'
                }`}
            >
              {/* Grip Handle for Dragging */}
              <div
                onMouseDown={handlePaletteMouseDown}
                onTouchStart={handlePaletteTouchStart}
                title="Drag toolbar anywhere across chart"
                className="flex items-center !gap-1.5 cursor-grab active:cursor-grabbing !px-2 !py-1 text-[#787B86] hover:text-[#F0F4F8] select-none group border-r border-[#242C3D] !mr-1.5"
              >
                <GripVertical size={18} className="text-[#787B86] group-hover:text-[#2962FF] transition-colors" />
                <span className="!text-xs font-mono font-bold tracking-wider hidden sm:inline text-[#787B86] group-hover:text-[#F0F4F8]">
                  FAVORITES
                </span>
              </div>

              {/* Favorite Drawing Actions */}
              <button
                onClick={() => handleSelectDrawing('segment')}
                title="Trend Line"
                className={`!w-9 !h-9 flex items-center justify-center !p-2 !rounded-lg !mx-0.5 hover:text-[#2962FF] hover:bg-[#2962FF]/10 transition-all ${activeDrawing === 'segment' ? 'text-[#2962FF] bg-[#2962FF]/15' : 'text-[#787B86]'
                  }`}
              >
                <TrendingUp size={20} />
              </button>
              <button
                onClick={() => handleSelectDrawing('rect')}
                title="Support/Resistance Breakout Box"
                className={`!w-9 !h-9 flex items-center justify-center !p-2 !rounded-lg !mx-0.5 hover:text-[#A855F7] hover:bg-[#A855F7]/10 transition-all ${activeDrawing === 'rect' ? 'text-[#A855F7] bg-[#A855F7]/15' : 'text-[#787B86]'
                  }`}
              >
                <Square size={20} />
              </button>
              <button
                onClick={() => handleSelectDrawing('horizontalStraightLine')}
                title="Horizontal Support/Resistance"
                className={`!w-9 !h-9 flex items-center justify-center !p-2 !rounded-lg !mx-0.5 hover:text-[#089981] hover:bg-[#089981]/10 transition-all ${activeDrawing === 'horizontalStraightLine' ? 'text-[#089981] bg-[#089981]/15' : 'text-[#787B86]'}`}
              >
                <Minus size={20} />
              </button>
              <button
                onClick={() => handleSelectDrawing('fibonacciLine')}
                title="Fibonacci Retracement"
                className={`!w-9 !h-9 flex items-center justify-center !p-2 !rounded-lg !mx-0.5 hover:text-[#FF9800] hover:bg-[#FF9800]/10 transition-all ${activeDrawing === 'fibonacciLine' ? 'text-[#FF9800] bg-[#FF9800]/15' : 'text-[#787B86]'
                  }`}
              >
                <Layers size={20} />
              </button>
              <button
                onClick={handleAutoSupportResistance}
                title="Auto S/R Detection"
                className="!w-9 !h-9 flex items-center justify-center !p-2 !rounded-lg !mx-0.5 text-[#A855F7] hover:bg-[#A855F7]/15 transition-all"
              >
                <Sparkles size={20} />
              </button>
              <div className="w-[1px] !h-6 bg-[#242C3D] !mx-1.5" />
              <button
                onClick={handleClearDrawings}
                title="Clear All"
                className="!w-9 !h-9 flex items-center justify-center !p-2 !rounded-lg !mx-0.5 text-[#787B86] hover:text-[#F23645] hover:bg-[#F23645]/15 transition-all"
              >
                <Trash2 size={20} />
              </button>
            </div>
            {/* Active Drawing Mode Pill */}
            {isInDrawingMode && activeDrawing !== 'cursor' && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-[#121721]/95 border border-[#2962FF] rounded-lg text-xs font-mono flex items-center gap-3 shadow-2xl backdrop-blur-md z-10">
                <span className="w-2 h-2 rounded-full bg-[#2962FF] animate-ping flex-shrink-0" />
                <span className="text-[#F0F4F8] font-semibold">{activeDrawing.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}</span>
                <span className="text-[#787B86]">— Click chart to place points</span>
                <button onClick={exitDrawingMode} className="ml-1 flex items-center gap-1 text-[#787B86] hover:text-white border border-[#242C3D] rounded px-1.5 py-0.5">
                  <X size={11} /><span className="text-[10px]">Esc</span>
                </button>
              </div>
            )}

            {isAnnotationComposerOpen && (
              <div className="absolute inset-0 z-40 grid place-items-center bg-[#0B0E14]/60 p-5 backdrop-blur-[2px]">
                <form
                  className="w-full max-w-sm border border-[#34415A] bg-[#121721] p-4 shadow-2xl"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setIsAnnotationComposerOpen(false);
                    handleSelectDrawing('simpleAnnotation', annotationText);
                    setAnnotationText('');
                  }}
                >
                  <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-[#8A9AB5]" htmlFor="annotation-text">Annotation text</label>
                  <input
                    id="annotation-text"
                    value={annotationText}
                    onChange={(event) => setAnnotationText(event.target.value)}
                    placeholder="e.g. Breakout confirmation"
                    maxLength={80}
                    autoFocus
                    className="mt-2 w-full border border-[#34415A] bg-[#0B0E14] !px-3 !py-2 text-sm text-[#F0F4F8] outline-none focus:border-[#2962FF]"
                  />
                  <p className="mt-2 text-[11px] leading-4 text-[#787B86]">Place the label with one click on the chart. Escape cancels an active drawing.</p>
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={() => setIsAnnotationComposerOpen(false)} className="border border-[#34415A] px-3 py-1.5 text-xs font-semibold text-[#AAB6CC] hover:bg-[#1A2230]">Cancel</button>
                    <button type="submit" className="border border-[#2962FF] bg-[#2962FF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1E4BD8]">Place note</button>
                  </div>
                </form>
              </div>
            )}

            {/* 🎯 Contextual Floating Toolbar for Selected Drawing */}
            {selectedOverlay && !isInDrawingMode && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center bg-[#121721]/95 backdrop-blur-xl border border-[#2962FF]/60 shadow-2xl !rounded-xl !px-3.5 !py-2 gap-3 z-30 animate-dropdown ring-1 ring-[#2962FF]/30">
                <div className="flex items-center gap-1.5 text-xs font-mono text-[#F0F4F8]">
                  <span className="w-2 h-2 rounded-full bg-[#00E676] animate-pulse" />
                  <span className="font-semibold uppercase tracking-wide">
                    {selectedOverlay.name.replace(/([A-Z])/g, ' $1').trim()}
                  </span>
                  <span className="text-[10px] text-[#787B86] ml-1 hidden sm:inline">SELECTED</span>
                </div>

                <div className="w-[1px] h-4 bg-[#242C3D]" />

                {/* Quick Delete Button for This Specific Selected Overlay */}
                <button
                  onClick={handleDeleteSelectedOverlay}
                  title="Delete Selected Drawing (Del / Backspace)"
                  className="flex items-center gap-1.5 !px-3 !py-1.5 !rounded-lg bg-[#F23645]/15 hover:bg-[#F23645]/25 text-[#F23645] border border-[#F23645]/40 text-xs font-semibold transition-all hover:scale-105 cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Delete Shape</span>
                </button>

                {/* Deselect / Close */}
                <button
                  onClick={() => setSelectedOverlay(null)}
                  title="Deselect (Esc)"
                  className="!p-1.5 !rounded-lg text-[#787B86] hover:text-white hover:bg-[#1A2230] transition-colors ml-0.5 cursor-pointer"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {/* Analysis level confirmation */}
            {levelToast && (
              <div
                className={`absolute top-14 right-6 !px-4 !py-2.5 !rounded-xl border shadow-2xl backdrop-blur-md z-20 text-xs font-mono animate-dropdown flex items-center gap-2 ${levelToast.type === 'BUY'
                    ? 'bg-[#089981]/20 border-[#089981] text-[#089981]'
                    : 'bg-[#F23645]/20 border-[#F23645] text-[#F23645]'
                  }`}
              >
                <span className="font-bold">{levelToast.type} LEVEL MARKED</span>
                <span>@ ${levelToast.price.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
