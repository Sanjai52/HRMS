export interface PayInputs {
  basicPaise: number;
  allowancesPaise: number;
  otherDeductionsPaise: number;
  pfPct: number;
  taxPct: number;
  scheduledDays: number;
  unpaidDays: number;
}

export interface PayBreakdown {
  grossPaise: number;
  dailyPaise: number;
  lopPaise: number;
  pfPaise: number;
  taxPaise: number;
  otherPaise: number;
  netPaise: number;
}

export function computePay(i: PayInputs): PayBreakdown {
  if (i.scheduledDays <= 0) throw new Error("scheduled-days-must-be-positive");
  const gross = i.basicPaise + i.allowancesPaise;
  const daily = Math.round(gross / i.scheduledDays);
  const lop = daily * Math.min(i.unpaidDays, i.scheduledDays);
  const pf = Math.round((i.basicPaise * i.pfPct) / 100);
  const tax = Math.round((gross * i.taxPct) / 100);
  const net = gross - lop - pf - tax - i.otherDeductionsPaise;
  return { grossPaise: gross, dailyPaise: daily, lopPaise: lop, pfPaise: pf, taxPaise: tax, otherPaise: i.otherDeductionsPaise, netPaise: net };
}

export function monthRange(period: string): { start: string; end: string } {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${last}` };
}

export function overlapWorkdays(aStart: string, aEnd: string, bStart: string, bEnd: string, holidays: Set<string>): number {
  const s = aStart > bStart ? aStart : bStart;
  const e = aEnd < bEnd ? aEnd : bEnd;
  if (s > e) return 0;
  let count = 0;
  const day = new Date(`${s}T00:00:00Z`);
  const end = new Date(`${e}T00:00:00Z`);
  while (day <= end) {
    const dow = day.getUTCDay();
    const iso = day.toISOString().slice(0, 10);
    if (dow !== 0 && dow !== 6 && !holidays.has(iso)) count += 1;
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return count;
}
