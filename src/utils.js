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
  // snap min and max to the nearest multiples of 60
  const start = Math.ceil(min / 60);
  const end = Math.floor(max / 60);

  // pick a random hour in that range
  const randomHour = Math.floor(Math.random() * (end - start + 1)) + start;

  // convert back to minutes
  return randomHour * 60;
}

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

export const getRandomSection = (sections, sem, sy) => {
  const filtered = sections.filter(
    (sec) => sec.semester.trim() === sem.trim() && sec.year.trim() === sy.trim()
  );
  
  if (filtered.length === 0) return null;

  return filtered[Math.floor(Math.random() * filtered.length)];
};


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

export const roundToSlot = (min, max, slotSize) => {
  const slots = Math.floor((max - min) / slotSize); // how many slots fit
  const randomSlot = Math.floor(Math.random() * (slots + 1)); // pick slot
  return min + randomSlot * slotSize;
}

export const getCurrentAcademicPeriod = async (supabase) => {
  try {
    const { data, error } = await supabase
      .from("academic_periods")
      .select("*")
      .eq("is_current", true)
      .single();

    if (error || !data) {
      // Fallback to default values if no current period is set
      return {
        id: null,
        semester: "1st",
        school_year: "2024-2025",
        is_current: true,
        status: "Active",
      };
    }

    return data;
  } catch (error) {
    console.error("Error fetching current academic period:", error);
    return {
      id: null,
      semester: "1st",
      school_year: "2024-2025",
      is_current: true,
      status: "Active",
    };
  }
};

export const getAcademicPeriodFilter = async (supabase) => {
  const currentPeriod = await getCurrentAcademicPeriod(supabase);

  // Return filter object that can be used in queries
  if (currentPeriod.id) {
    return { academic_period_id: currentPeriod.id };
  } else {
    return {
      semester: currentPeriod.semester,
      school_year: currentPeriod.school_year,
    };
  }
};

export const ensureAcademicPeriodId = async (supabase, data) => {
  const currentPeriod = await getCurrentAcademicPeriod(supabase);

  // If we have a current period ID, add it to the data
  if (currentPeriod.id) {
    return { ...data, academic_period_id: currentPeriod.id };
  }

  // Otherwise, ensure semester and school_year are set
  return {
    ...data,
    semester: data.semester || currentPeriod.semester,
    school_year: data.school_year || currentPeriod.school_year,
  };
};