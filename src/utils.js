export const parseAvailableDays = (abbrString) => {
  if (!abbrString) return [];

  const daysMap = {
    M: "Monday",
    T: "Tuesday",
    W: "Wednesday",
    TH: "Thursday",
    F: "Friday",
    S: "Saturday",
    SU: "Sunday",
  };

  const result = [];
  for (let i = 0; i < abbrString.length; ) {
    if (abbrString[i] === "T" && abbrString[i + 1] === "H") {
      result.push("TH");
      i += 2;
    } else if (abbrString[i] === "S" && abbrString[i + 1] === "U") {
      result.push("SU");
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
    thursday: "TH",
    friday: "F",
    saturday: "S",
    sunday: "SU",
  };

  return days.map((day) => dayAbbreviations[day.toLowerCase()] || "").join("");
};

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
    "18:00",
  ];
};

export const getRandomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const toHHMM = (minutes) => {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
};

export function toMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export function overlap(a, b) {
  return (
    toMinutes(a.start) < toMinutes(b.end) &&
    toMinutes(b.start) < toMinutes(a.end)
  );
}

export const generateTimeDaySlots = ({
  startTime,
  endTime,
  slotDuration,
  days,
}) => {
  const slots = [];

  const toTimeStr = (minutes) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
  };

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  for (const day of days) {
    for (let t = start; t + slotDuration <= end; t += slotDuration) {
      slots.push({
        day,
        start: toTimeStr(t),
        end: toTimeStr(t + slotDuration),
      });
    }
  }

  return slots;
};

export const getRandomSection = (sections) =>
  sections[Math.floor(Math.random() * sections.length)];

export const isRoomAvailable = (room, day, start, end) => {
  const bookings = roomBookings[day] || [];
  return !bookings.some(
    (b) => b.room.id === room.id && overlap(b, { start, end })
  );
};

export const calculateDurationInTimeFormat = (start, end) => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  const diffMinutes = endMinutes - startMinutes;

  // Convert back to HH:MM format
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}`;
};
