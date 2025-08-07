const supabase = require("../../supabase");
const {
  generateDayAbbrev,
  parseAvailableDays,
  generateTimeSlots,
} = require("../utils");
const { getMyLoadQuery, getMySchedulesQuery } = require("../queries/faculty");

const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat.js");
const relativeTime = require("dayjs/plugin/relativeTime");

dayjs.extend(customParseFormat);
dayjs.extend(relativeTime);

const scheduleOverview = async (id) => {
  const { data, error } = await supabase
    .from("teacher_schedules")
    .select(getMySchedulesQuery)
    .eq("teacher_id", id);

  if (error) {
    throw error;
  }

  const now = dayjs(); // Server time
  const currentDay = now.format("dddd"); // e.g., "Monday"
  const currentTime = now.format("HH:mm");

  const classes = [];
  const allClasses = [];
  let totalClassesToday = 0;
  let completedToday = 0;
  let upcomingToday = [];

  data.map((item) => {
    const fullDays = parseAvailableDays(item.days);
    const isToday = fullDays.includes(currentDay);

    const todayDate = now.format("YYYY-MM-DD");
    const start = dayjs(
      `${todayDate} ${item.start_time}`,
      "YYYY-MM-DD HH:mm:ss"
    );
    const end = dayjs(`${todayDate} ${item.end_time}`, "YYYY-MM-DD HH:mm:ss");

    let status = "upcoming";

    if (isToday) {
      totalClassesToday++;

      if (now.isBefore(start)) {
        status = "upcoming";
        upcomingToday.push(start);
      } else if (now.isAfter(end)) {
        status = "completed";
        completedToday++;
      } else {
        status = "current";
      }
      classes.push({
        id: item.id,
        subject: item.subjects.subject,
        code: item.subjects.subject_code,
        section: item.sections.name,
        time: `${start.format("HH:mm")} - ${end.format("HH:mm")}`,
        room: item.rooms.room_title,
        students: item.total_count,
        status,
      });
    }

    let scheduledDateTime = null;

    for (let i = 0; i < 7; i++) {
      const checkDate = now.add(i, "day");
      if (fullDays.includes(checkDate.format("dddd"))) {
        scheduledDateTime = dayjs(
          `${checkDate.format("YYYY-MM-DD")} ${item.start_time}`,
          "YYYY-MM-DD HH:mm:ss"
        );
        break;
      }
    }

    // 🛡️ Ensure scheduledDateTime is a valid Dayjs object
    if (scheduledDateTime && scheduledDateTime.isValid()) {
      const timeUntil = scheduledDateTime.fromNow();
      const readableDate = scheduledDateTime.format("dddd, MMMM D, YYYY");

      allClasses.push({
        id: item.id,
        subject: item.subjects.subject,
        code: item.subjects.subject_code,
        section: item.sections.name,
        time: `${start.format("HH:mm")} - ${end.format("HH:mm")}`,
        room: item.rooms.room_title,
        students: item.total_count,
        date: readableDate,
        timeUntil: timeUntil,
        status: timeUntil,
      });
    } else {
      console.warn(`Invalid scheduledDateTime for item ID ${item.id}`);
    }
  });

  const nextClassTime = upcomingToday.length
    ? [...upcomingToday]
        .sort((a, b) => a.valueOf() - b.valueOf())[0]
        .format("hh:mm A")
    : null;

  return {
    currentTime: now.format("hh:mm A"),
    date: now.format("dddd, MMMM D, YYYY"),
    todaysClasses: {
      metric: totalClassesToday,
      completedClass: completedToday,
      nextClass: nextClassTime,
    },
    classes,
    allClasses,
  };
};

const availabilityOverview = async (id) => {
  const { data, error } = await supabase
    .from("teacher_profile")
    .select("avail_days, pref_time")
    .eq("id", id)
    .single();

  if (error || !data) throw error;

  const { avail_days, pref_time } = data;
  const availableDays = parseAvailableDays(avail_days); // e.g., ["Monday", "Wednesday", "Friday"]

  const allDays = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  const dailyPreferences = allDays.map((day) => ({
    day,
    available: availableDays.includes(day),
    preferredTimes: availableDays.includes(day) ? [pref_time] : [],
    restrictedTimes: [],
  }));

  return dailyPreferences;
};

const loadOverview = async (id) => {
  const { data, error } = await supabase
    .from("teacher_schedules")
    .select(getMyLoadQuery)
    .eq("teacher_id", id);

  if (error) throw error;

  const subjectMap = {};
  let totalSubjects = 0;
  let totalSections = 0;
  let totalStudents = 0;
  let weeklyHours = 0;

  data.forEach((entry) => {
    const subjectId = entry.subjects.id;

    // Initialize subject entry
    if (!subjectMap[subjectId]) {
      subjectMap[subjectId] = {
        id: subjectId,
        code: entry.subjects.subject_code,
        title: entry.subjects.subject,
        sections: [],
        totalStudents: 0,
        weeklyHours: 0,
        level: entry.subjects.level || "undergraduate",
      };
      totalSubjects++;
    }

    const subject = subjectMap[subjectId];

    // Process schedule string (e.g. "MWF 08:00-09:30")
    const dayMap = { M: "M", T: "T", W: "W", Th: "Th", F: "F" };
    const rawDays = entry.days.match(/Th|[MTWF]/g) || [];
    const shortDays = rawDays.map((d) => dayMap[d]).join("");

    const timeRange = `${entry.start_time.slice(0, 5)}-${entry.end_time.slice(
      0,
      5
    )}`;
    const scheduleStr = `${shortDays} ${timeRange}`;

    // Check if section already added under this subject
    const existingSection = subject.sections.find(
      (s) => s.id === entry.sections.id
    );

    if (existingSection) {
      existingSection.schedule += `, ${scheduleStr}`; // merge schedules
    } else {
      subject.sections.push({
        id: entry.sections.name,
        students: entry.total_count,
        schedule: scheduleStr,
        room: entry.rooms.room_title,
      });
      subject.totalStudents += entry.total_count;
      subject.weeklyHours += entry.subjects.units;

      totalStudents += entry.total_count;
      weeklyHours += entry.subjects.units;
      totalSections++;
    }
  });

  // Build final structured response
  const subjects = Object.values(subjectMap);

  return {
    summary: {
      totalSubjects,
      totalSections,
      totalStudents,
      weeklyHours,
      maxCapacity: 21,
      loadPercentage: Math.round((weeklyHours / 21) * 100), // assuming 21 hrs is 100%
    },
    subjects,
  };
};

const getDashboard = async (req, res) => {
  try {
    const { id } = req.params;

    const [scheduleOverviewData, availabilityOverviewData, loadOverviewData] =
      await Promise.all([
        scheduleOverview(id),
        availabilityOverview(id),
        loadOverview(id),
      ]);

    const response = {
      scheduleOverview: scheduleOverviewData,
      availabilityOverview: availabilityOverviewData,
      loadOverview: loadOverviewData,
    };

    return res.status(200).json({
      title: "Success",
      message: "Dashboard data retrieved successfully",
      data: response,
    });
  } catch (error) {
    console.error("Error retrieving dashboard data:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const getMySchedules = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("teacher_schedules")
      .select(getMySchedulesQuery)
      .eq("teacher_id", id);

    if (error) {
      throw error;
    }

    const events = data.map((item, index) => {
      const [hour, minute, second] = item.start_time.split(":").map(Number);
      const [endHour, endMinute] = item.end_time.split(":").map(Number);

      const start = new Date();
      const end = new Date();

      start.setHours(hour, minute, second || 0, 0);
      end.setHours(endHour, endMinute, 0, 0);

      return {
        id: `event-${index + 1}`,
        title: item.subjects.subject_code,
        subject: item.subjects.subject,
        subjectCode: item.subjects.subject_code,
        room: item.rooms?.room_title || "TBA",
        section: item.sections?.name || "Unknown",
        students: item.total_count || 0,
        start,
        end,
        type: "lecture", // hardcoded or derive from subject if available
        status: "Scheduled",
        description: "", // optional: if subject.description available
        objectives: [], // optional: fill if available
        materials: [], // optional: fill if available
      };
    });

    return res.status(200).json({
      title: "Success",
      message: "Schedules get successfully.",
      data: events,
    });
  } catch (error) {
    console.error("Error fetching schedules:", error);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const getMyLoad = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("teacher_schedules")
      .select(getMyLoadQuery)
      .eq("teacher_id", id);

    if (error) throw error;

    // Group by subject + section
    const grouped = {};

    data.forEach((entry) => {
      const subjKey = `${entry.subjects.id}-${entry.sections.id}`;

      if (!grouped[subjKey]) {
        grouped[subjKey] = {
          id: entry.subjects.id,
          code: entry.subjects.subject_code,
          name: entry.subjects.subject,
          department: entry.teacher_profile?.departments?.name || null,
          credits: entry.subjects.units,
          type: "lecture",
          semester:
            entry.semester === "1st" ? "First Semester" : "Second Semester",
          academicYear: entry.school_year,
          sections: [],
        };
      }

      let section = grouped[subjKey].sections.find(
        (s) => s.id === entry.sections.id
      );
      if (!section) {
        section = {
          id: entry.sections.id,
          section: entry.sections.name,
          schedule: [],
          enrolledStudents: entry.total_count,
          maxCapacity: 45,
          hoursPerWeek: entry.subjects.units,
        };
        grouped[subjKey].sections.push(section);
      }

      // Expand days like "MWF" => ["Monday", "Wednesday", "Friday"]
      const dayMap = {
        M: "Monday",
        T: "Tuesday",
        W: "Wednesday",
        Th: "Thursday",
        F: "Friday",
      };
      const dayCodes = entry.days.match(/Th|[MTWF]/g); // handles "Th" as one

      for (const d of dayCodes) {
        section.schedule.push({
          day: dayMap[d],
          startTime: entry.start_time.slice(0, 5), // "13:00:00" -> "13:00"
          endTime: entry.end_time.slice(0, 5),
          room: entry.rooms.room_id,
        });
      }
    });

    return res.status(200).json({
      title: "Success",
      message: "Schedules get successfully.",
      data: Object.values(grouped),
    });
  } catch (error) {
    console.error("Error fetching my load:", error);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const getPrefTimeDay = async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from("teacher_profile")
      .select("avail_days, pref_time")
      .eq("id", id)
      .single();

    if (error || !data) throw error;

    const { avail_days, pref_time } = data;

    const availableDays = parseAvailableDays(avail_days); // from your utils

    // Parse time range string (e.g. "09:00-17:00") to time slot array
    const [start, end] = pref_time.split("-");
    const timeSlots = generateTimeSlots(); // e.g. returns ["08:00", ..., "17:00"]

    // Get only the relevant hours in the range
    const filteredSlots = timeSlots.filter(
      (slot) => slot >= start && slot <= end
    );

    // Build the availability object
    const availability = {};
    timeSlots.forEach((slot) => {
      availableDays.forEach((day) => {
        const key = day.toLowerCase(); // convert "Monday" → "monday"
        if (!availability[key]) availability[key] = {};
        availability[key][slot] = filteredSlots.includes(slot);
      });
    });

    return res.status(200).json({
      title: "Success",
      message: "Schedules fetched successfully.",
      data: availability,
    });
  } catch (error) {
    console.error("Error fetching my load:", error);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const savePrefTImeDay = async (req, res) => {
  try {
    const { id, workDays, workHours } = req.body;

    const abbreviatedDays = generateDayAbbrev(workDays);
    const timeRange = `${workHours[0]}-${workHours[workHours.length - 1]}`;

    const { data, error } = await supabase
      .from("teacher_schedules")
      .update({
        avail_days: abbreviatedDays,
        pref_time: timeRange,
      })
      .eq("teacher_id", id);

    if (error) {
      throw error;
    }

    return res.status(200).json({
      title: "Success",
      message: "Preferences saved successfully",
      data,
    });
  } catch (error) {
    console.error("Error fetching my load:", error);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

module.exports = {
  getDashboard,
  getMySchedules,
  getMyLoad,
  getPrefTimeDay,
  savePrefTImeDay,
};
