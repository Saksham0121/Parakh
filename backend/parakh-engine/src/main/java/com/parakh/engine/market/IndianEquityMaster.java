package com.parakh.engine.market;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** Curated NSE tickers for instant, network-free autocomplete and bare-ticker normalisation. */
final class IndianEquityMaster {
    private IndianEquityMaster() {}

    static final Map<String, String> TICKERS;
    static {
        Map<String, String> m = new LinkedHashMap<>();
        m.put("GRSE", "Garden Reach Shipbuilders & Engineers Ltd");
        m.put("BSE", "BSE Limited");
        m.put("HAL", "Hindustan Aeronautics Limited");
        m.put("BEL", "Bharat Electronics Limited");
        m.put("COCHINSHIP", "Cochin Shipyard Limited");
        m.put("BDL", "Bharat Dynamics Limited");
        m.put("MAZDOCK", "Mazagon Dock Shipbuilders Limited");
        m.put("RVNL", "Rail Vikas Nigam Limited");
        m.put("IRFC", "Indian Railway Finance Corporation");
        m.put("ZOMATO", "Zomato Limited");
        m.put("PAYTM", "One97 Communications Limited (Paytm)");
        m.put("JIOFIN", "Jio Financial Services Limited");
        m.put("CDSL", "Central Depository Services (India) Ltd");
        m.put("RELIANCE", "Reliance Industries Limited");
        m.put("TCS", "Tata Consultancy Services Limited");
        m.put("HDFCBANK", "HDFC Bank Limited");
        m.put("INFY", "Infosys Limited");
        m.put("TATAMOTORS", "Tata Motors Limited");
        m.put("TATASTEEL", "Tata Steel Limited");
        m.put("ICICIBANK", "ICICI Bank Limited");
        m.put("SBIN", "State Bank of India");
        m.put("ITC", "ITC Limited");
        m.put("LT", "Larsen & Toubro Limited");
        m.put("BHARTIARTL", "Bharti Airtel Limited");
        m.put("ADANIENT", "Adani Enterprises Limited");
        m.put("ADANIPORTS", "Adani Ports and Special Economic Zone");
        m.put("ASIANPAINT", "Asian Paints Limited");
        m.put("MARUTI", "Maruti Suzuki India Limited");
        m.put("SUNPHARMA", "Sun Pharmaceutical Industries Limited");
        m.put("WIPRO", "Wipro Limited");
        m.put("HCLTECH", "HCL Technologies Limited");
        m.put("NTPC", "NTPC Limited");
        m.put("POWERGRID", "Power Grid Corporation of India");
        m.put("TITAN", "Titan Company Limited");
        m.put("BAJFINANCE", "Bajaj Finance Limited");
        m.put("BAJAJFINSV", "Bajaj Finserv Limited");
        m.put("ONGC", "Oil & Natural Gas Corporation");
        m.put("COALINDIA", "Coal India Limited");
        m.put("KOTAKBANK", "Kotak Mahindra Bank");
        m.put("AXISBANK", "Axis Bank Limited");
        m.put("ULTRACEMCO", "UltraTech Cement Limited");
        m.put("NESTLEIND", "Nestle India Limited");
        m.put("JSWSTEEL", "JSW Steel Limited");
        m.put("TRENT", "Trent Limited");
        m.put("VEDL", "Vedanta Limited");
        m.put("IREDA", "Indian Renewable Energy Dev Agency");
        m.put("SUZLON", "Suzlon Energy Limited");
        m.put("BHEL", "Bharat Heavy Electricals Limited");
        m.put("NHPC", "NHPC Limited");
        m.put("SJVN", "SJVN Limited");
        m.put("YESBANK", "Yes Bank Limited");
        m.put("IDEA", "Vodafone Idea Limited");
        TICKERS = Collections.unmodifiableMap(m);
    }
}
