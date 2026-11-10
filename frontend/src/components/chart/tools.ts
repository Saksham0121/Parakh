import {
  ArrowBigDown, ArrowBigUp, ArrowRightToLine, Circle, Minus, MousePointer2, MoveUpRight, Rows3, Ruler,
  SeparatorVertical, Slash, Square, StickyNote, TrendingUp, Triangle, Equal, ChevronsUpDown, Spline,
} from 'lucide-react';

export type ToolId =
  | 'cursor' | 'segment' | 'rayLine' | 'straightLine' | 'horizontalStraightLine' | 'horizontalRayLine'
  | 'verticalStraightLine' | 'priceLine' | 'parallelStraightLine' | 'priceChannelLine' | 'fibonacciLine'
  | 'rectZone' | 'circleShape' | 'triangleShape' | 'longPosition' | 'shortPosition' | 'measure'
  | 'note' | 'arrowUp' | 'arrowDown';

export interface ToolDef { id: ToolId; label: string; icon: typeof Minus; hint: string; key?: string }

const T = (id: ToolId, label: string, icon: typeof Minus, hint: string, key?: string): ToolDef => ({ id, label, icon, hint, key });

export const TOOL_GROUPS: Array<{ id: string; label: string; tools: ToolDef[] }> = [
  { id: 'cursor', label: 'Cursor', tools: [T('cursor', 'Cursor', MousePointer2, '', 'Esc')] },
  {
    id: 'lines', label: 'Lines', tools: [
      T('segment', 'Trend line', TrendingUp, 'Click two points', 'Alt+T'),
      T('rayLine', 'Ray', MoveUpRight, 'Click start, then direction'),
      T('straightLine', 'Extended line', Slash, 'Click two points'),
      T('horizontalStraightLine', 'Horizontal line', Minus, 'Click a price level', 'Alt+H'),
      T('horizontalRayLine', 'Horizontal ray', ArrowRightToLine, 'Click a price level'),
      T('verticalStraightLine', 'Vertical line', SeparatorVertical, 'Click a bar', 'Alt+V'),
      T('priceLine', 'Price line', Equal, 'Click a price level'),
    ],
  },
  {
    id: 'channels', label: 'Channels', tools: [
      T('parallelStraightLine', 'Parallel channel', Rows3, 'Click two points, then the channel width'),
      T('priceChannelLine', 'Price channel', ChevronsUpDown, 'Click two points, then the offset'),
    ],
  },
  { id: 'fib', label: 'Fibonacci', tools: [T('fibonacciLine', 'Fib retracement', Spline, 'Click swing low, then swing high', 'Alt+F')] },
  {
    id: 'shapes', label: 'Shapes', tools: [
      T('rectZone', 'Rectangle', Square, 'Click two opposite corners', 'Alt+R'),
      T('circleShape', 'Circle', Circle, 'Click centre, then radius'),
      T('triangleShape', 'Triangle', Triangle, 'Click three points'),
    ],
  },
  {
    id: 'positions', label: 'Positions', tools: [
      T('longPosition', 'Long position', ArrowBigUp, 'Click the entry price — drag target and stop to adjust', 'Alt+L'),
      T('shortPosition', 'Short position', ArrowBigDown, 'Click the entry price — drag target and stop to adjust', 'Alt+S'),
      T('measure', 'Price range', Ruler, 'Click two points to measure', 'Alt+M'),
    ],
  },
  {
    id: 'notes', label: 'Annotations', tools: [
      T('note', 'Text note', StickyNote, 'Click where the note goes'),
      T('arrowUp', 'Arrow up', ArrowBigUp, 'Click below a bar'),
      T('arrowDown', 'Arrow down', ArrowBigDown, 'Click above a bar'),
    ],
  },
];

export const ALL_TOOLS = TOOL_GROUPS.flatMap((g) => g.tools);
export const toolDef = (id: string) => ALL_TOOLS.find((t) => t.id === id);
export const PALETTE = ['#5b8cff', '#22b07d', '#ef4f5f', '#f2a93b', '#9b7bff', '#3dc7d8', '#e7e9ee'];
