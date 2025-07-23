export const parseAvailableDays = (abbrString) => {

  if (!abbrString) return [];

  const daysMap = {
    M: 'Monday',
    T: 'Tuesday',
    W: 'Wednesday',
    TH: 'Thursday',
    F: 'Friday',
    S: 'Saturday',
    SU: 'Sunday',
  };

  const result = [];
  for (let i = 0; i < abbrString.length; ) {
    if (abbrString[i] === 'T' && abbrString[i + 1] === 'H') {
      result.push('TH');
      i += 2;
    } else if (abbrString[i] === 'S' && abbrString[i + 1] === 'U') {
      result.push('SU');
      i += 2;
    } else {
      result.push(abbrString[i]);
      i += 1;
    }
  }

  return result.map((abbr) => daysMap[abbr] || abbr);
};


export function toMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export function overlap(a, b) {
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
}