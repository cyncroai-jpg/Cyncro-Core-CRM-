/**
 * Curated roster of billionaire / ultra-high-net-worth investors whose funds
 * file quarterly 13F-HR holdings reports with the SEC. CIKs are the SEC filer
 * IDs; every sync re-reads the filer name from EDGAR so a mismatch is visible.
 */
export type InvestorSeed = {
  cik: string;
  name: string;
  fund: string;
  style: string;
};

export const INVESTOR_SEEDS: InvestorSeed[] = [
  { cik: "0001067983", name: "Warren Buffett", fund: "Berkshire Hathaway", style: "Quality value" },
  { cik: "0001336528", name: "Bill Ackman", fund: "Pershing Square", style: "Concentrated activist" },
  { cik: "0001649339", name: "Michael Burry", fund: "Scion Asset Management", style: "Deep value / contrarian" },
  { cik: "0001350694", name: "Ray Dalio", fund: "Bridgewater Associates", style: "Global macro" },
  { cik: "0001656456", name: "David Tepper", fund: "Appaloosa", style: "Opportunistic" },
  { cik: "0001536411", name: "Stanley Druckenmiller", fund: "Duquesne Family Office", style: "Macro growth" },
  { cik: "0000921669", name: "Carl Icahn", fund: "Icahn Capital", style: "Activist" },
  { cik: "0001040273", name: "Dan Loeb", fund: "Third Point", style: "Event-driven activist" },
  { cik: "0001061768", name: "Seth Klarman", fund: "Baupost Group", style: "Margin-of-safety value" },
  { cik: "0001029160", name: "George Soros", fund: "Soros Fund Management", style: "Global macro" },
  { cik: "0001167483", name: "Chase Coleman", fund: "Tiger Global", style: "Tech growth" },
  { cik: "0001135730", name: "Philippe Laffont", fund: "Coatue Management", style: "Tech growth" },
  { cik: "0001709323", name: "Li Lu", fund: "Himalaya Capital", style: "Concentrated value" },
  { cik: "0001166559", name: "Bill Gates", fund: "Gates Foundation Trust", style: "Long-term quality" },
  { cik: "0001103804", name: "Andreas Halvorsen", fund: "Viking Global", style: "Long/short equity" },
  { cik: "0001569205", name: "Terry Smith", fund: "Fundsmith", style: "Quality compounders" },
  { cik: "0001112520", name: "Chuck Akre", fund: "Akre Capital", style: "Compounders" },
  { cik: "0001549575", name: "Mohnish Pabrai", fund: "Dalal Street", style: "Concentrated value" },
  { cik: "0000949509", name: "Howard Marks", fund: "Oaktree Capital", style: "Distressed / credit" },
  { cik: "0001061165", name: "Stephen Mandel", fund: "Lone Pine Capital", style: "Long/short growth" },
  { cik: "0001345471", name: "Nelson Peltz", fund: "Trian Fund Management", style: "Activist" },
  { cik: "0001079114", name: "David Einhorn", fund: "Greenlight Capital", style: "Value long/short" },
  { cik: "0001035674", name: "John Paulson", fund: "Paulson & Co", style: "Event-driven" },
  { cik: "0001647251", name: "Christopher Hohn", fund: "TCI Fund Management", style: "Concentrated activist" },
  { cik: "0001747057", name: "Dan Sundheim", fund: "D1 Capital Partners", style: "Growth long/short" },
  { cik: "0001418814", name: "Jeff Ubben", fund: "ValueAct Capital", style: "Constructive activist" },
];

export function normalizeCik(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits || digits.length > 10) return null;
  return digits.padStart(10, "0");
}
