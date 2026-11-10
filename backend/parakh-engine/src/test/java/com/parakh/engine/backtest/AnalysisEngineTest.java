package com.parakh.engine.backtest;

import com.parakh.common.analysis.Candles;
import com.parakh.common.analysis.IndicatorMath;
import com.parakh.common.analysis.SetupEvaluator;
import com.parakh.common.dto.condition.FundamentalConditionDto;
import com.parakh.common.dto.condition.TechnicalConditionDto;
import com.parakh.common.dto.order.OrderRuleDto;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class AnalysisEngineTest {

    /** Flat at 100 for 30 bars, then a breakout bar to 110 on triple volume, then drifts up. */
    private static Candles breakoutSeries() {
        int n = 60;
        long[] t = new long[n];
        double[] o = new double[n], h = new double[n], l = new double[n], c = new double[n], v = new double[n];
        for (int i = 0; i < n; i++) {
            t[i] = 1_700_000_000L + i * 86400L;
            double px = i < 30 ? 100 + (i % 2) : 110 + (i - 30) * 0.5;
            o[i] = px - 0.5; c[i] = px; h[i] = px + 1; l[i] = px - 1;
            v[i] = i == 30 ? 3000 : 1000;
        }
        return new Candles(t, o, h, l, c, v);
    }

    @Test
    void smaAndEmaMatchHandComputedValues() {
        double[] src = {1, 2, 3, 4, 5};
        double[] sma = IndicatorMath.sma(src, 3);
        assertTrue(Double.isNaN(sma[1]));
        assertEquals(2.0, sma[2], 1e-9);
        assertEquals(4.0, sma[4], 1e-9);
        double[] ema = IndicatorMath.ema(src, 3);
        assertEquals(2.0, ema[2], 1e-9);       // seeded with the SMA
        assertEquals(3.0, ema[3], 1e-9);       // 4*0.5 + 2*0.5
    }

    @Test
    void rsiIsHundredForStrictlyRisingSeries() {
        double[] up = new double[30];
        for (int i = 0; i < up.length; i++) up[i] = i + 1;
        assertEquals(100.0, IndicatorMath.rsi(up, 14)[29], 1e-9);
    }

    @Test
    void breakoutWithVolumeConfirmationFiresOnlyOnTheBreakoutBar() {
        SetupEvaluator ev = new SetupEvaluator(breakoutSeries());
        TechnicalConditionDto breakout = new TechnicalConditionDto();
        breakout.setIndicator("BREAKOUT");
        breakout.setParams(Map.of("lookback", 20, "volumeMultiplier", 2.0));
        assertFalse(ev.evaluateOne(breakout, 29).passed());
        assertTrue(ev.evaluateOne(breakout, 30).passed());
        assertFalse(ev.evaluateOne(breakout, 31).passed(), "volume on the follow-through bar is ordinary");
    }

    @Test
    void indicatorVsIndicatorCrossover() {
        SetupEvaluator ev = new SetupEvaluator(breakoutSeries());
        TechnicalConditionDto cross = new TechnicalConditionDto();
        cross.setIndicator("PRICE");
        cross.setOperator("crosses_above");
        cross.setCompareTo("indicator");
        cross.setCompareIndicator("SMA");
        cross.setCompareParams(Map.of("period", 10));
        int hits = 0;
        for (int i = 0; i < 60; i++) if (ev.evaluateOne(cross, i).passed()) hits++;
        assertTrue(hits >= 1);
        // bar 28 closes below its SMA(10), bar 29 closes above it
        assertTrue(ev.evaluateOne(cross, 29).passed());
        assertFalse(ev.evaluateOne(cross, 30).passed(), "already above: no new cross");
    }

    @Test
    void rsiConditionComparesRsiNotPrice() {
        // The old backtester compared the *close* with the threshold, so "RSI > 70" fired whenever price > 70.
        SetupEvaluator ev = new SetupEvaluator(breakoutSeries());
        TechnicalConditionDto rsi = new TechnicalConditionDto("RSI", Map.of("period", 14), "gt", 70, null, "AND");
        var r = ev.evaluateOne(rsi, 20);
        assertNotNull(r.actual());
        assertTrue(r.actual() < 70, "choppy flat market has a mid-range RSI, not ~100");
        assertFalse(r.passed());
    }

    @Test
    void fundamentalsAcceptCamelCaseAndFailWhenMissing() {
        var ok = SetupEvaluator.evaluateFundamentals(
                List.of(new FundamentalConditionDto("peRatio", "lt", 25.0)), Map.of("pe_ratio", 18.0));
        assertTrue(ok.passed());
        var missing = SetupEvaluator.evaluateFundamentals(
                List.of(new FundamentalConditionDto("roe", "gt", 15.0)), Map.of("pe_ratio", 18.0));
        assertFalse(missing.passed());
    }

    @Test
    void simulatorEntersNextOpenAndHitsTakeProfit() {
        Candles c = breakoutSeries();
        TechnicalConditionDto breakout = new TechnicalConditionDto();
        breakout.setIndicator("BREAKOUT");
        breakout.setParams(Map.of("lookback", 20, "volumeMultiplier", 2.0));
        OrderRuleDto rule = new OrderRuleDto();
        rule.setStopLossPct(5.0);
        rule.setTakeProfitPct(3.0);
        var job = new BacktestDtos.BacktestJob("r", "s", "X", 0, Long.MAX_VALUE, "D", 100_000, 0, 100, false);

        var sim = BacktestSimulatorService.simulate(c, 0, c.size() - 1, List.of(breakout), rule, job, true);
        assertEquals(1, sim.trades().size());
        var trade = sim.trades().get(0);
        assertEquals(c.open()[31], (Double) trade.get("entryPrice"), 1e-6, "fills at the bar after the signal");
        assertEquals("take_profit", trade.get("exitReason"));
        assertEquals(3.0, (Double) trade.get("returnPct"), 0.01);
        assertEquals(sim.bars().size(), sim.equity().size());
    }

    @Test
    void shortSideProfitsFromFallingPrices() {
        int n = 40;
        long[] t = new long[n];
        double[] o = new double[n], h = new double[n], l = new double[n], cl = new double[n], v = new double[n];
        for (int i = 0; i < n; i++) {
            t[i] = i * 86400L;
            double px = 200 - i * 2;
            o[i] = px + 1; cl[i] = px; h[i] = px + 2; l[i] = px - 1; v[i] = 1000;
        }
        Candles c = new Candles(t, o, h, l, cl, v);
        TechnicalConditionDto below = new TechnicalConditionDto("PRICE", Map.of(), "lt", 190, null, "AND");
        OrderRuleDto rule = new OrderRuleDto();
        rule.setSide("SHORT");
        rule.setMaxHoldBars(5);
        var job = new BacktestDtos.BacktestJob("r", "s", "X", 0, Long.MAX_VALUE, "D", 100_000, 0, 100, false);
        var sim = BacktestSimulatorService.simulate(c, 0, n - 1, List.of(below), rule, job, true);
        assertFalse(sim.trades().isEmpty());
        assertTrue(sim.trades().stream().allMatch(tr -> (Double) tr.get("returnPct") > 0));
        assertTrue((Double) sim.stats().get("totalReturnPct") > 0);
    }
}
