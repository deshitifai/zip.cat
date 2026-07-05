// Known ticker symbols the implicit /stock trigger is allowed to match.
// detectImplicit must stay pure + synchronous (it runs on every keystroke),
// so implicit pickup validates against this bundled list instead of hitting
// a quote API. Explicit "/stock <symbol>" is NOT gated by this list — Yahoo
// validates unknown symbols at execution time.
//
// Sources: S&P 500 constituents (en.wikipedia.org/wiki/List_of_S%26P_500_companies,
// fetched 2026-07-01) plus widely traded ETFs, ADRs, and popular non-S&P names.
// Regenerate the S&P block by re-scraping that page when it drifts.

const SP500_TICKERS = [
  "A", "AAPL", "ABBV", "ABNB", "ABT", "ACGL", "ACN", "ADBE", "ADI", "ADM",
  "ADP", "ADSK", "AEE", "AEP", "AES", "AFL", "AIG", "AIZ", "AJG", "AKAM",
  "ALB", "ALGN", "ALL", "ALLE", "AMAT", "AMCR", "AMD", "AME", "AMGN", "AMP",
  "AMT", "AMZN", "ANET", "AON", "AOS", "APA", "APD", "APH", "APO", "APP",
  "APTV", "ARE", "ARES", "ATO", "AVB", "AVGO", "AVY", "AWK", "AXON", "AXP",
  "AZO", "BA", "BAC", "BALL", "BAX", "BBY", "BDX", "BEN", "BF.B", "BG",
  "BIIB", "BKNG", "BKR", "BLDR", "BLK", "BMY", "BNY", "BR", "BRK.B", "BRO",
  "BSX", "BX", "BXP", "C", "CAH", "CARR", "CASY", "CAT", "CB", "CBRE",
  "CCI", "CCL", "CDNS", "CDW", "CEG", "CF", "CFG", "CHD", "CHRW", "CHTR",
  "CI", "CIEN", "CINF", "CL", "CLX", "CMCSA", "CME", "CMG", "CMI", "CMS",
  "CNC", "CNP", "COF", "COHR", "COIN", "COO", "COP", "COR", "COST", "CPAY",
  "CPRT", "CPT", "CRH", "CRL", "CRM", "CRWD", "CSCO", "CSGP", "CSX", "CTAS",
  "CTSH", "CTVA", "CVNA", "CVS", "CVX", "D", "DAL", "DASH", "DD", "DDOG",
  "DE", "DECK", "DELL", "DG", "DGX", "DHI", "DHR", "DIS", "DLR", "DLTR",
  "DOC", "DOV", "DOW", "DPZ", "DRI", "DTE", "DUK", "DVA", "DVN", "DXCM",
  "EA", "EBAY", "ECHO", "ECL", "ED", "EFX", "EG", "EIX", "EL", "ELV",
  "EME", "EMR", "EOG", "EQIX", "EQR", "EQT", "ERIE", "ES", "ESS", "ETN",
  "ETR", "EVRG", "EW", "EXC", "EXE", "EXPD", "EXPE", "EXR", "F", "FANG",
  "FAST", "FCX", "FDS", "FDX", "FDXF", "FE", "FFIV", "FICO", "FIS", "FISV",
  "FITB", "FIX", "FLEX", "FOX", "FOXA", "FRT", "FSLR", "FTNT", "FTV", "GD",
  "GDDY", "GE", "GEHC", "GEN", "GEV", "GILD", "GIS", "GL", "GLW", "GM",
  "GNRC", "GOOG", "GOOGL", "GPC", "GPN", "GRMN", "GS", "GWW", "HAL", "HAS",
  "HBAN", "HCA", "HD", "HIG", "HII", "HLT", "HON", "HONA", "HOOD", "HPE",
  "HPQ", "HRL", "HSIC", "HST", "HSY", "HUBB", "HUM", "HWM", "IBKR", "IBM",
  "ICE", "IDXX", "IEX", "IFF", "INCY", "INTC", "INTU", "INVH", "IP", "IQV",
  "IR", "IRM", "ISRG", "IT", "ITW", "IVZ", "J", "JBHT", "JBL", "JCI",
  "JKHY", "JNJ", "JPM", "KDP", "KEY", "KEYS", "KHC", "KIM", "KKR", "KLAC",
  "KMB", "KMI", "KO", "KR", "KVUE", "L", "LDOS", "LEN", "LH", "LHX",
  "LII", "LIN", "LITE", "LLY", "LMT", "LNT", "LOW", "LRCX", "LULU", "LUV",
  "LVS", "LYB", "LYV", "MA", "MAA", "MAR", "MAS", "MCD", "MCHP", "MCK",
  "MCO", "MDLZ", "MDT", "MET", "META", "MGM", "MKC", "MLM", "MMM", "MNST",
  "MO", "MOS", "MPC", "MPWR", "MRK", "MRNA", "MRSH", "MRVL", "MS", "MSCI",
  "MSFT", "MSI", "MTB", "MTD", "MU", "NCLH", "NDAQ", "NDSN", "NEE", "NEM",
  "NFLX", "NI", "NKE", "NOC", "NOW", "NRG", "NSC", "NTAP", "NTRS", "NUE",
  "NVDA", "NVR", "NWS", "NWSA", "NXPI", "O", "ODFL", "OKE", "OMC", "ON",
  "ORCL", "ORLY", "OTIS", "OXY", "PANW", "PAYX", "PCAR", "PCG", "PEG", "PEP",
  "PFE", "PFG", "PG", "PGR", "PH", "PHM", "PKG", "PLD", "PLTR", "PM",
  "PNC", "PNR", "PNW", "PODD", "PPG", "PPL", "PRU", "PSA", "PSKY", "PSX",
  "PTC", "PWR", "PYPL", "Q", "QCOM", "RCL", "REG", "REGN", "RF", "RJF",
  "RL", "RMD", "ROK", "ROL", "ROP", "ROST", "RSG", "RTX", "RVTY", "SBAC",
  "SBUX", "SCHW", "SHW", "SJM", "SLB", "SMCI", "SNA", "SNDK", "SNPS", "SO",
  "SOLV", "SPG", "SPGI", "SRE", "STE", "STLD", "STT", "STX", "STZ", "SW",
  "SWK", "SWKS", "SYF", "SYK", "SYY", "T", "TAP", "TDG", "TDY", "TECH",
  "TEL", "TER", "TFC", "TGT", "TJX", "TKO", "TMO", "TMUS", "TPL", "TPR",
  "TRGP", "TRMB", "TROW", "TRV", "TSCO", "TSLA", "TSN", "TT", "TTD", "TTWO",
  "TXN", "TXT", "TYL", "UAL", "UBER", "UDR", "UHS", "ULTA", "UNH", "UNP",
  "UPS", "URI", "USB", "V", "VEEV", "VICI", "VLO", "VLTO", "VMC", "VRSK",
  "VRSN", "VRT", "VRTX", "VST", "VTR", "VTRS", "VZ", "WAB", "WAT", "WBD",
  "WDAY", "WDC", "WEC", "WELL", "WFC", "WM", "WMB", "WMT", "WRB", "WSM",
  "WST", "WTW", "WY", "WYNN", "XEL", "XOM", "XYL", "XYZ", "YUM", "ZBH",
  "ZBRA", "ZTS"
];

// Widely traded ETFs and funds.
const ETF_TICKERS = [
  "SPY", "QQQ", "QQQM", "VOO", "VTI", "IVV", "IWM", "DIA", "RSP", "SPLG",
  "GLD", "SLV", "VNQ", "VEA", "VWO", "VXUS", "BND", "AGG", "TLT", "LQD",
  "HYG", "JEPI", "JEPQ", "SCHD", "VIG", "VYM", "EEM", "EFA", "SMH", "SOXX",
  "ARKK", "TQQQ", "SQQQ", "IBIT", "ETHA", "BITO",
  "XLB", "XLC", "XLE", "XLF", "XLI", "XLK", "XLP", "XLRE", "XLU", "XLV", "XLY"
];

// Popular names outside the S&P 500 (growth, meme, crypto-adjacent) and
// heavily traded ADRs.
const POPULAR_TICKERS = [
  "BRK.A", "BF.A", "TSM", "BABA", "JD", "PDD", "NIO", "XPEV", "LI", "ASML",
  "SAP", "SHOP", "SPOT", "SE", "SNAP", "PINS", "RBLX", "U", "RIVN", "LCID",
  "MSTR", "RDDT", "ARM", "SNOW", "NET", "DKNG", "MARA", "RIOT", "GME", "AMC",
  "SOFI", "AFRM", "UPST", "HIMS", "CHWY", "W", "ETSY", "PTON", "DOCU", "ZM",
  "OKTA", "TWLO", "MDB", "TEAM", "ZS", "S", "AI", "NVO", "TM", "SONY",
  "SHEL", "BP", "UL"
];

export const KNOWN_TICKERS: ReadonlySet<string> = new Set([
  ...SP500_TICKERS,
  ...ETF_TICKERS,
  ...POPULAR_TICKERS
]);

export function isKnownTicker(token: string): boolean {
  const upper = token.toUpperCase();
  return KNOWN_TICKERS.has(upper);
}
