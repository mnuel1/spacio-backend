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
  for (let i = 0; i < abbrString.length;) {
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

export const generateDayAbbrev = (days) => {
  const dayAbbreviations = {
    monday: "M",
    tuesday: "T",
    wednesday: "W",
    thursday: "Th",
    friday: "F",
  };

  return days
    .map(day => dayAbbreviations[day.toLowerCase()] || "")
    .join("");
}

export const generateTimeSlots = () => {
  return [
    "08:00",
    "09:00",
    "10:00",
    "11:00",
    "12:00",
    "13:00",
    "14:00",
    "15:00",
    "16:00",
    "17:00",
    "18:00"
  ]
}


export function toMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export function overlap(a, b) {
  return toMinutes(a.start) < toMinutes(b.end) && toMinutes(b.start) < toMinutes(a.end);
}