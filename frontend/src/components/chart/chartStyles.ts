import { LineType, PolygonType, TooltipShowRule } from 'klinecharts';

const UP = '#22b07d';
const DOWN = '#ef4f5f';
const TEXT = '#7d8494';
const GRID = '#161a23';
const MONO = "'IBM Plex Mono', ui-monospace, monospace";

export const CHART_STYLES = {
  grid: { horizontal: { color: GRID }, vertical: { color: GRID } },
  candle: {
    bar: { upColor: UP, downColor: DOWN, noChangeColor: TEXT, upBorderColor: UP, downBorderColor: DOWN, noChangeBorderColor: TEXT, upWickColor: UP, downWickColor: DOWN, noChangeWickColor: TEXT },
    area: { lineColor: '#5b8cff', lineSize: 2, backgroundColor: [{ offset: 0, color: 'rgba(91,140,255,0.25)' }, { offset: 1, color: 'rgba(91,140,255,0.01)' }] },
    priceMark: {
      high: { color: TEXT, textFamily: MONO },
      low: { color: TEXT, textFamily: MONO },
      last: { upColor: UP, downColor: DOWN, noChangeColor: TEXT, line: { style: LineType.Dashed, dashedValue: [3, 3] }, text: { family: MONO, borderRadius: 3 } },
    },
    tooltip: { showRule: TooltipShowRule.None },
  },
  indicator: {
    bars: [{ style: PolygonType.Fill, upColor: 'rgba(34,176,125,0.55)', downColor: 'rgba(239,79,95,0.55)', noChangeColor: TEXT }],
    lines: [
      { color: '#f2a93b', size: 1.4 }, { color: '#5b8cff', size: 1.4 }, { color: '#c77dff', size: 1.4 },
      { color: '#3dc7d8', size: 1.4 }, { color: '#e7e9ee', size: 1.4 },
    ],
    tooltip: { showRule: TooltipShowRule.Always, showName: true, showParams: true, text: { family: MONO, size: 11, color: TEXT, marginTop: 6 } },
    lastValueMark: { show: false },
  },
  xAxis: { axisLine: { color: '#222836' }, tickLine: { color: '#222836' }, tickText: { color: TEXT, family: MONO, size: 11 } },
  yAxis: { axisLine: { color: '#222836' }, tickLine: { color: '#222836' }, tickText: { color: TEXT, family: MONO, size: 11 } },
  separator: { color: '#222836', activeBackgroundColor: 'rgba(91,140,255,0.15)' },
  crosshair: {
    horizontal: { line: { color: '#545b6b', style: LineType.Dashed, dashedValue: [4, 3] }, text: { backgroundColor: '#2e3546', family: MONO, borderColor: '#2e3546' } },
    vertical: { line: { color: '#545b6b', style: LineType.Dashed, dashedValue: [4, 3] }, text: { backgroundColor: '#2e3546', family: MONO, borderColor: '#2e3546' } },
  },
  overlay: {
    point: { color: '#5b8cff', borderColor: 'rgba(91,140,255,0.35)', borderSize: 4, radius: 4, activeColor: '#5b8cff', activeBorderColor: 'rgba(91,140,255,0.35)', activeBorderSize: 6, activeRadius: 5 },
    line: { color: '#5b8cff', size: 1.5 },
    text: { family: MONO },
    rectText: { family: MONO, backgroundColor: '#5b8cff', borderColor: '#5b8cff' },
  },
};

export const INDICATORS = [
  { id: 'VOL', label: 'Volume', pane: true, defaultOn: true },
  { id: 'MA', label: 'Moving averages (5/10/30/60)', pane: false, defaultOn: false },
  { id: 'EMA', label: 'EMA (6/12/20)', pane: false, defaultOn: true },
  { id: 'BOLL', label: 'Bollinger Bands', pane: false },
  { id: 'SAR', label: 'Parabolic SAR', pane: false },
  { id: 'BBI', label: 'Bull & Bear Index', pane: false },
  { id: 'RSI', label: 'RSI', pane: true },
  { id: 'MACD', label: 'MACD', pane: true },
  { id: 'KDJ', label: 'Stochastic (KDJ)', pane: true },
  { id: 'CCI', label: 'CCI', pane: true },
  { id: 'DMI', label: 'DMI / ADX', pane: true },
  { id: 'OBV', label: 'On-Balance Volume', pane: true },
  { id: 'WR', label: 'Williams %R', pane: true },
  { id: 'ROC', label: 'Rate of Change', pane: true },
  { id: 'MTM', label: 'Momentum', pane: true },
  { id: 'TRIX', label: 'TRIX', pane: true },
];
